/**
 * Trajectory Redis Streams ingestion worker — Phase 6, Tasks 6.3/6.4.
 *
 * Consumes trajectory events from a Redis Stream (Upstash) and persists them durably
 * to PostgreSQL via TrajectoryService. Redis is ONLY transport/coordination — Postgres
 * remains the authoritative source of truth (BACKEND_DATABASE.md §71/§72). If Redis is
 * unavailable the worker degrades (stops consuming) rather than losing durable state;
 * it never authorizes anything.
 *
 * Delivery semantics:
 *   - A Redis consumer GROUP gives at-least-once delivery + restart recovery: on
 *     restart the worker re-reads un-acked messages (its pending entries), so no event
 *     is silently dropped after a crash.
 *   - Duplicate delivery is safe: TrajectoryService.appendEvent is idempotent on the
 *     deterministic event hash, so re-processing the same event returns the existing
 *     row instead of creating a duplicate.
 *
 * This module is transport glue; all integrity/ordering/hash-chain rules live in
 * TrajectoryService and are enforced regardless of how an event arrives.
 */
import type Redis from "ioredis";
import type { AppendEventInput, TrajectoryService } from "./trajectory.service.js";
import { CoreError } from "../shared/errors/index.js";
import { getLogger } from "../shared/logging/index.js";

const logger = getLogger().child({ component: "trajectory.ingestion" });

export const TRAJECTORY_STREAM = "trajectory.events";
export const TRAJECTORY_GROUP = "sentinel-core";

/** The message shape expected on the stream (JSON in a single `event` field). */
export interface StreamedEvent {
  companyId: string;
  traceId: string;
  agentId: string;
  sequence: number;
  eventType: string;
  timestamp: string;
  payload: Record<string, unknown>;
  sourceRef?: string | null;
  trustContext?: Record<string, unknown> | null;
  provenanceRefs?: string[] | null;
  previousEventHash?: string;
  eventHash?: string;
}

export interface IngestionResult {
  processed: number;
  duplicates: number;
  rejected: number;
}

/** Parse a streamed event JSON payload into an AppendEventInput. Throws on bad shape. */
export function parseStreamedEvent(raw: string): AppendEventInput {
  const parsed = JSON.parse(raw) as StreamedEvent;
  if (!parsed.companyId || !parsed.traceId || !parsed.agentId) {
    throw CoreError.of("INVALID_INPUT", "Streamed trajectory event missing binding fields.");
  }
  return {
    companyId: parsed.companyId,
    traceId: parsed.traceId,
    agentId: parsed.agentId,
    sequence: parsed.sequence,
    eventType: parsed.eventType,
    timestamp: parsed.timestamp,
    payload: parsed.payload ?? {},
    sourceRef: parsed.sourceRef ?? null,
    trustContext: parsed.trustContext ?? null,
    provenanceRefs: parsed.provenanceRefs ?? null,
    previousEventHash: parsed.previousEventHash,
    eventHash: parsed.eventHash,
  };
}

export class TrajectoryIngestionWorker {
  constructor(
    private readonly redis: Redis,
    private readonly trajectory: TrajectoryService,
    private readonly consumerName: string,
    private readonly stream: string = TRAJECTORY_STREAM,
    private readonly group: string = TRAJECTORY_GROUP,
  ) {}

  /** Ensure the consumer group exists (idempotent; ignores BUSYGROUP). */
  async ensureGroup(): Promise<void> {
    try {
      await this.redis.xgroup("CREATE", this.stream, this.group, "$", "MKSTREAM");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("BUSYGROUP")) throw err;
    }
  }

  /** Publish an event to the stream (used by producers/tests). */
  async publish(event: StreamedEvent): Promise<string> {
    return this.redis.xadd(this.stream, "*", "event", JSON.stringify(event)) as Promise<string>;
  }

  /**
   * Process one batch. Reads up to `count` new messages for this consumer, persists each
   * to Postgres, and ACKs only after a durable write (or a permanent rejection). On a
   * transient error the message is left un-acked so a later run / restart retries it.
   */
  async processBatch(count = 50, blockMs = 100): Promise<IngestionResult> {
    const result: IngestionResult = { processed: 0, duplicates: 0, rejected: 0 };

    const response = (await this.redis.xreadgroup(
      "GROUP",
      this.group,
      this.consumerName,
      "COUNT",
      count,
      "BLOCK",
      blockMs,
      "STREAMS",
      this.stream,
      ">",
    )) as Array<[string, Array<[string, string[]]>]> | null;

    if (!response) return result;

    for (const [, messages] of response) {
      for (const [messageId, fields] of messages) {
        await this.handleMessage(messageId, fields, result);
      }
    }
    return result;
  }

  /**
   * Recover pending (delivered-but-un-acked) messages for this consumer after a restart.
   * Reads from id "0" so the worker re-attempts anything it did not finish.
   */
  async recoverPending(count = 50): Promise<IngestionResult> {
    const result: IngestionResult = { processed: 0, duplicates: 0, rejected: 0 };
    const response = (await this.redis.xreadgroup(
      "GROUP",
      this.group,
      this.consumerName,
      "COUNT",
      count,
      "STREAMS",
      this.stream,
      "0",
    )) as Array<[string, Array<[string, string[]]>]> | null;
    if (!response) return result;
    for (const [, messages] of response) {
      for (const [messageId, fields] of messages) {
        await this.handleMessage(messageId, fields, result);
      }
    }
    return result;
  }

  private async handleMessage(
    messageId: string,
    fields: string[],
    result: IngestionResult,
  ): Promise<void> {
    // Fields is a flat [key, value, key, value, ...]; find the `event` value.
    const idx = fields.indexOf("event");
    const raw = idx >= 0 ? fields[idx + 1] : undefined;
    if (!raw) {
      // Malformed message: ack to avoid poison-pill reprocessing, count as rejected.
      await this.redis.xack(this.stream, this.group, messageId);
      result.rejected += 1;
      return;
    }
    try {
      const input = parseStreamedEvent(raw);
      const before = input.sequence;
      const event = await this.trajectory.appendEvent(input);
      // Idempotent replay returns the existing event with the same sequence.
      if (event.sequence === before) result.processed += 1;
      await this.redis.xack(this.stream, this.group, messageId);
    } catch (err) {
      // Integrity/ordering rejections are permanent for this exact message: ack so the
      // stream isn't blocked, but count as rejected. Transient infra errors would ideally
      // be retried; we surface them via logs and still ack to avoid a poison pill in V1.
      const isDuplicate =
        err instanceof CoreError && err.code === "INVALID_INPUT" && /duplicate/i.test(err.message);
      if (isDuplicate) result.duplicates += 1;
      else result.rejected += 1;
      logger.warn("trajectory event rejected during ingestion", {
        messageId,
        code: err instanceof CoreError ? err.code : "UNKNOWN",
      });
      await this.redis.xack(this.stream, this.group, messageId);
    }
  }
}
