/**
 * Trajectory / provenance service — Phase 6, Tasks 6.1/6.2/6.4/6.5/6.7.
 *
 * Core is the authoritative durable owner of the agent trajectory (the ordered,
 * observable sequence of actions that led to a proposal). Events form a tamper-evident
 * hash chain: each event's `previousEventHash` must equal the current trace head's
 * `eventHash`, and its own `eventHash` is derived deterministically from its content +
 * the previous hash (BACKEND_DATABASE.md §22/§23, SECURITY_MODEL.md §41).
 *
 * Invariants enforced here:
 *   - APPEND-ONLY: there is no update/delete path for historical events. Corrections
 *     are represented as NEW events (§24). This service exposes only create/append/read.
 *   - Strict ordering: an event's sequence must be exactly head + 1. Duplicate or
 *     out-of-order sequences are rejected (the DB unique (trace_id, sequence) is the
 *     final backstop; we reject early with a clear domain error).
 *   - Chain integrity: previousEventHash must match the stored head hash; a supplied
 *     eventHash (if any) must match the recomputed hash, so a tampered payload cannot
 *     be persisted with a stale/forged hash.
 *   - Replay protection: eventHash is globally unique; re-delivering the same event is
 *     idempotent (returns the existing row) rather than duplicating it.
 *   - Tenant scoping: every read/write is company-scoped.
 *
 * PostgreSQL is the durable source of truth. Redis (the ingestion worker) is only a
 * transport; nothing here depends on Redis for correctness.
 */
import type { PrismaClient, TrajectoryEvent, TrajectoryTrace } from "@prisma/client";
import { CoreError } from "../shared/errors/index.js";
import { sha256Json } from "../shared/hash.js";

export interface CreateTraceInput {
  companyId: string;
  agentId: string;
  intentId?: string | null;
}

export interface AppendEventInput {
  companyId: string;
  traceId: string;
  agentId: string;
  sequence: number;
  eventType: string;
  timestamp: string; // ISO
  payload: Record<string, unknown>;
  sourceRef?: string | null;
  trustContext?: Record<string, unknown> | null;
  provenanceRefs?: string[] | null;
  /** Optional client-supplied hash; if present it MUST match the recomputed hash. */
  eventHash?: string;
  /** Optional client-supplied previous hash; if present it MUST match the head. */
  previousEventHash?: string;
}

/** Genesis hash for the first event in a trace. */
const GENESIS_HASH = "sha256:genesis";

export class TrajectoryService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Deterministically compute an event's hash from its content + the previous hash.
   * Any change to payload/type/sequence/timestamp/provenance changes the hash, which
   * is what makes payload tampering detectable.
   */
  computeEventHash(input: {
    traceId: string;
    sequence: number;
    eventType: string;
    timestamp: string;
    payload: Record<string, unknown>;
    provenanceRefs?: string[] | null;
    previousEventHash: string;
  }): string {
    return sha256Json({
      traceId: input.traceId,
      sequence: input.sequence,
      eventType: input.eventType,
      timestamp: input.timestamp,
      payload: input.payload,
      provenanceRefs: input.provenanceRefs ?? [],
      previousEventHash: input.previousEventHash,
    });
  }

  async createTrace(input: CreateTraceInput): Promise<TrajectoryTrace> {
    const agent = await this.db.agent.findFirst({
      where: { id: input.agentId, companyId: input.companyId },
    });
    if (!agent) {
      throw CoreError.of("TENANT_ERROR", "Agent not found in this company.", {
        details: { companyId: input.companyId, agentId: input.agentId },
      });
    }
    return this.db.trajectoryTrace.create({
      data: {
        companyId: input.companyId,
        agentId: input.agentId,
        intentId: input.intentId ?? null,
        status: "ACTIVE",
        sequenceHead: 0,
        headHash: GENESIS_HASH,
      },
    });
  }

  async getTrace(companyId: string, traceId: string): Promise<TrajectoryTrace | null> {
    return this.db.trajectoryTrace.findFirst({ where: { id: traceId, companyId } });
  }

  /**
   * Append an event to a trace, enforcing ordering + chain integrity atomically. The
   * trace row is locked for the duration so concurrent appends serialize and cannot
   * both claim head + 1.
   */
  async appendEvent(input: AppendEventInput): Promise<TrajectoryEvent> {
    return this.db.$transaction(async (tx) => {
      const trace = await tx.trajectoryTrace.findFirst({
        where: { id: input.traceId, companyId: input.companyId },
      });
      if (!trace) {
        throw CoreError.of("NOT_FOUND", "Trajectory trace not found in this company.", {
          details: { companyId: input.companyId, traceId: input.traceId },
        });
      }
      // Wrong trace: the event's agent must match the trace's agent.
      if (input.agentId !== trace.agentId) {
        throw CoreError.of("INVALID_INPUT", "Event agent does not match trace agent.", {
          details: { eventAgent: input.agentId, traceAgent: trace.agentId },
        });
      }
      if (trace.status !== "ACTIVE") {
        throw CoreError.of("CONFLICT", "Cannot append to a non-active trace.", {
          details: { traceId: trace.id, status: trace.status },
        });
      }

      const expectedSequence = trace.sequenceHead + 1;
      if (input.sequence !== expectedSequence) {
        // Covers duplicate sequence (<=head) and gaps (>head+1).
        throw CoreError.of("INVALID_INPUT", "Out-of-order or duplicate trajectory sequence.", {
          details: { expected: expectedSequence, received: input.sequence },
        });
      }

      const headHash = trace.headHash ?? GENESIS_HASH;
      // If the caller supplied a previous hash, it must match the actual chain head.
      if (input.previousEventHash !== undefined && input.previousEventHash !== headHash) {
        throw CoreError.of("INVALID_INPUT", "previous_event_hash does not match chain head.", {
          details: { expected: headHash, received: input.previousEventHash },
        });
      }

      // Canonicalize the timestamp so the hash computed at append time matches the hash
      // recomputed during verifyChain (which reads the millisecond-precision DB value).
      const canonicalTs = new Date(input.timestamp).toISOString();
      const computed = this.computeEventHash({
        traceId: input.traceId,
        sequence: input.sequence,
        eventType: input.eventType,
        timestamp: canonicalTs,
        payload: input.payload,
        provenanceRefs: input.provenanceRefs ?? null,
        previousEventHash: headHash,
      });
      // If the caller supplied an event hash, it must match the recomputed hash. A
      // tampered payload (hash computed over different content) is rejected here.
      if (input.eventHash !== undefined && input.eventHash !== computed) {
        throw CoreError.of("INVALID_INPUT", "event_hash does not match event content (tamper).", {
          details: { expected: computed, received: input.eventHash },
        });
      }

      // Replay protection: if this exact event hash already exists, return it (idempotent).
      const dup = await tx.trajectoryEvent.findUnique({ where: { eventHash: computed } });
      if (dup) return dup;

      const event = await tx.trajectoryEvent.create({
        data: {
          traceId: input.traceId,
          companyId: input.companyId,
          agentId: input.agentId,
          sequence: input.sequence,
          eventType: input.eventType,
          timestamp: new Date(canonicalTs),
          payloadJson: input.payload as unknown as object,
          sourceRef: input.sourceRef ?? null,
          trustContextJson: (input.trustContext ?? null) as unknown as object,
          provenanceRefsJson: (input.provenanceRefs ?? null) as unknown as object,
          previousEventHash: headHash,
          eventHash: computed,
        },
      });

      // Advance the chain head.
      await tx.trajectoryTrace.update({
        where: { id: trace.id },
        data: { sequenceHead: input.sequence, headHash: computed },
      });

      return event;
    });
  }

  /** Ordered events for a trace (company-scoped). */
  async getEvents(companyId: string, traceId: string): Promise<TrajectoryEvent[]> {
    return this.db.trajectoryEvent.findMany({
      where: { traceId, companyId },
      orderBy: { sequence: "asc" },
    });
  }

  /** A trace + its ordered events (timeline view). */
  async getTimeline(
    companyId: string,
    traceId: string,
  ): Promise<{ trace: TrajectoryTrace; events: TrajectoryEvent[] } | null> {
    const trace = await this.getTrace(companyId, traceId);
    if (!trace) return null;
    const events = await this.getEvents(companyId, traceId);
    return { trace, events };
  }

  /**
   * Verify the full hash chain of a trace: sequences are contiguous, each event's
   * previousEventHash links to the prior event's eventHash, and each eventHash matches
   * a recomputation over its content. Returns true iff intact.
   */
  async verifyChain(companyId: string, traceId: string): Promise<boolean> {
    const events = await this.getEvents(companyId, traceId);
    let prev = GENESIS_HASH;
    let expectedSeq = 1;
    for (const e of events) {
      if (e.sequence !== expectedSeq) return false;
      if (e.previousEventHash !== prev) return false;
      const recomputed = this.computeEventHash({
        traceId,
        sequence: e.sequence,
        eventType: e.eventType,
        timestamp: e.timestamp.toISOString(),
        payload: e.payloadJson as unknown as Record<string, unknown>,
        provenanceRefs: (e.provenanceRefsJson as unknown as string[] | null) ?? null,
        previousEventHash: prev,
      });
      if (recomputed !== e.eventHash) return false;
      prev = e.eventHash;
      expectedSeq += 1;
    }
    return true;
  }

  /** Mark a trace completed (append-only; does not touch events). */
  async completeTrace(companyId: string, traceId: string): Promise<TrajectoryTrace> {
    const trace = await this.getTrace(companyId, traceId);
    if (!trace) {
      throw CoreError.of("NOT_FOUND", "Trajectory trace not found.", { details: { traceId } });
    }
    return this.db.trajectoryTrace.update({
      where: { id: trace.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  }
}
