/**
 * Idempotency store — guarantees one logical payment per idempotency key.
 *
 * The same logical ExecutionRequest (same idempotency_key) must never broadcast twice.
 * The in-memory implementation is sufficient for a single execution process and for
 * tests; a durable implementation would back this with a DB/redis in production. The
 * store also caches the ExecutionResult + verification so `getResult`/`verify` (which
 * take only an execution_id) can answer later without re-broadcasting.
 */
import type { ExecutionResult, ReceiptVerification } from "../contracts/execution-contracts.js";

export interface ExecutionRecord {
  executionId: string;
  idempotencyKey: string;
  result: ExecutionResult;
  verification?: ReceiptVerification;
  /** The authorized snapshot, retained so verify() can re-run against a fresh receipt. */
  authorized?: unknown;
}

export interface IdempotencyStore {
  byKey(key: string): ExecutionRecord | undefined;
  byExecutionId(id: string): ExecutionRecord | undefined;
  put(record: ExecutionRecord): void;
  update(id: string, patch: Partial<ExecutionRecord>): void;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly keyIndex = new Map<string, string>(); // key -> executionId
  private readonly records = new Map<string, ExecutionRecord>(); // executionId -> record

  byKey(key: string): ExecutionRecord | undefined {
    const id = this.keyIndex.get(key);
    return id ? this.records.get(id) : undefined;
  }

  byExecutionId(id: string): ExecutionRecord | undefined {
    return this.records.get(id);
  }

  put(record: ExecutionRecord): void {
    this.records.set(record.executionId, record);
    this.keyIndex.set(record.idempotencyKey, record.executionId);
  }

  update(id: string, patch: Partial<ExecutionRecord>): void {
    const existing = this.records.get(id);
    if (existing) this.records.set(id, { ...existing, ...patch });
  }
}
