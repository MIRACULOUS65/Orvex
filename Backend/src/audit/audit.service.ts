/**
 * Audit service — Phase 14 (Tasks 14.1-14.3).
 *
 * Append-only, hash-chained audit log (BACKEND_DATABASE.md §48/§49). Each event links to
 * the previous event via previous_event_hash -> event_hash, giving tamper evidence for
 * the off-chain audit chain. Events are never rewritten. Appending the same logical
 * event twice is idempotent (event_hash is globally unique; a re-append returns the
 * existing row).
 *
 * The chain is per (company, entity_type, entity_id) so a transaction's lifecycle forms
 * one ordered, verifiable chain regardless of interleaving with other entities.
 */
import type { AuditEvent, PrismaClient } from "@prisma/client";
import { sha256Json } from "../shared/hash.js";

const GENESIS = "sha256:audit-genesis";

export interface AppendAuditInput {
  companyId: string;
  agentId?: string | null;
  correlationId?: string | null;
  requestId?: string | null;
  entityType: string;
  entityId: string;
  eventType: string;
  actorType: string;
  actorId: string;
  payload: Record<string, unknown>;
  references?: Record<string, unknown>;
  /**
   * Optional stable identity for this logical event. When provided, re-appending with
   * the same key is idempotent (returns the existing row) — the correct model for
   * at-least-once event delivery / crash-retry. When omitted, each append is a distinct
   * chained event.
   */
  eventKey?: string;
}

export class AuditService {
  constructor(private readonly db: PrismaClient) {}

  private computeHash(input: {
    companyId: string;
    entityType: string;
    entityId: string;
    eventType: string;
    payload: Record<string, unknown>;
    previousEventHash: string;
  }): string {
    // Timestamp is intentionally NOT part of the hash: the DB generates created_at, so
    // hashing over it would make append (client time) and verify (DB time) diverge. The
    // chain integrity is provided by previous_event_hash + content, which is sufficient
    // for tamper evidence.
    return sha256Json(input);
  }

  /**
   * Append an audit event to the chain for (company, entity). Idempotent on the computed
   * event hash: replaying the same logical event returns the existing row instead of
   * duplicating it.
   */
  async append(input: AppendAuditInput): Promise<AuditEvent> {
    return this.db.$transaction(async (tx) => {
      const previous = await tx.auditEvent.findFirst({
        where: { companyId: input.companyId, entityType: input.entityType, entityId: input.entityId },
        orderBy: { createdAt: "desc" },
      });
      const previousHash = previous?.eventHash ?? GENESIS;

      // Idempotent replay: if a logically-identical event already exists on this entity
      // chain (same eventType + payload + references, and same eventKey when provided),
      // return it rather than appending a duplicate. This handles at-least-once delivery
      // and crash-retry without breaking the positional hash chain.
      const contentFingerprint = sha256Json({
        companyId: input.companyId,
        entityType: input.entityType,
        entityId: input.entityId,
        eventType: input.eventType,
        payload: input.payload,
        references: input.references ?? {},
        eventKey: input.eventKey ?? null,
      });
      const priorSameContent = await tx.auditEvent.findFirst({
        where: {
          companyId: input.companyId,
          entityType: input.entityType,
          entityId: input.entityId,
          eventType: input.eventType,
          // Fingerprint stored inside payloadJson for dedup lookup.
          payloadJson: { path: ["_fingerprint"], equals: contentFingerprint },
        },
      });
      if (priorSameContent) return priorSameContent;

      // The chain hash remains purely positional (content + previous head), so
      // verifyChain can validate it deterministically.
      const eventHash = this.computeHash({
        companyId: input.companyId,
        entityType: input.entityType,
        entityId: input.entityId,
        eventType: input.eventType,
        payload: { ...input.payload, references: input.references ?? {}, _fingerprint: contentFingerprint },
        previousEventHash: previousHash,
      });

      const existing = await tx.auditEvent.findUnique({ where: { eventHash } });
      if (existing) return existing;

      return tx.auditEvent.create({
        data: {
          companyId: input.companyId,
          agentId: input.agentId ?? null,
          correlationId: input.correlationId ?? null,
          requestId: input.requestId ?? null,
          entityType: input.entityType,
          entityId: input.entityId,
          eventType: input.eventType,
          actorType: input.actorType,
          actorId: input.actorId,
          payloadJson: { ...input.payload, references: input.references ?? {}, _fingerprint: contentFingerprint } as unknown as object,
          previousEventHash: previousHash,
          eventHash,
        },
      });
    });
  }

  /** All audit events for an entity, in order (timeline). */
  async getEntityTimeline(companyId: string, entityType: string, entityId: string): Promise<AuditEvent[]> {
    return this.db.auditEvent.findMany({
      where: { companyId, entityType, entityId },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Verify the hash chain for an entity is intact (append-only, unbroken links). */
  async verifyChain(companyId: string, entityType: string, entityId: string): Promise<boolean> {
    const events = await this.getEntityTimeline(companyId, entityType, entityId);
    let prev = GENESIS;
    for (const e of events) {
      if (e.previousEventHash !== prev) return false;
      const recomputed = this.computeHash({
        companyId: e.companyId,
        entityType: e.entityType,
        entityId: e.entityId,
        eventType: e.eventType,
        payload: e.payloadJson as unknown as Record<string, unknown>,
        previousEventHash: prev,
      });
      if (recomputed !== e.eventHash) return false;
      prev = e.eventHash;
    }
    return true;
  }
}
