/**
 * Idempotency service — Phase 5, Tasks 5.3/5.4.
 *
 * Protects financial operations against accidental duplication (BACKEND_DATABASE.md
 * §51/§52, CONTRACTS.md §35). Semantics:
 *
 *   same (company, operation_type, key) + same request_hash
 *       -> return the existing record (the caller should reuse its stored result)
 *   same key + DIFFERENT request_hash
 *       -> IDEMPOTENCY_CONFLICT (accidental key reuse for a different request)
 *   new key
 *       -> register a new IN_PROGRESS record and proceed
 *
 * The uniqueness is enforced by the DB constraint (company_id, operation_type,
 * idempotency_key); the registration is done via an insert whose conflict is caught,
 * so two concurrent first-time requests cannot both proceed.
 */
import type { IdempotencyRecord, PrismaClient } from "@prisma/client";
import { CoreError } from "../../shared/errors/index.js";
import { sha256Json } from "../../shared/hash.js";

export interface RegisterInput {
  companyId: string;
  idempotencyKey: string;
  operationType: string;
  /** The request payload; hashed to detect key reuse for a different request. */
  request: unknown;
  resourceType?: string;
  resourceId?: string;
  expiresAt?: Date | null;
}

export type RegisterResult =
  | { outcome: "NEW"; record: IdempotencyRecord }
  | { outcome: "REPLAY"; record: IdempotencyRecord };

export class IdempotencyService {
  constructor(private readonly db: PrismaClient) {}

  /** Stable hash of the request payload. */
  requestHash(request: unknown): string {
    return sha256Json(request);
  }

  /**
   * Register (or recognize) an idempotent operation. Returns NEW when this is the first
   * time the key is seen (caller proceeds), REPLAY when the same key+hash already exists
   * (caller returns the stored result), and throws IDEMPOTENCY_CONFLICT on key reuse
   * with a different request hash.
   */
  async register(input: RegisterInput): Promise<RegisterResult> {
    const hash = this.requestHash(input.request);

    const existing = await this.db.idempotencyRecord.findFirst({
      where: {
        companyId: input.companyId,
        operationType: input.operationType,
        idempotencyKey: input.idempotencyKey,
      },
    });
    if (existing) {
      if (existing.requestHash !== hash) {
        throw CoreError.of("IDEMPOTENCY_CONFLICT", "Idempotency key reused with a different request.", {
          details: {
            idempotencyKey: input.idempotencyKey,
            operationType: input.operationType,
          },
        });
      }
      return { outcome: "REPLAY", record: existing };
    }

    try {
      const record = await this.db.idempotencyRecord.create({
        data: {
          companyId: input.companyId,
          idempotencyKey: input.idempotencyKey,
          operationType: input.operationType,
          resourceType: input.resourceType ?? null,
          resourceId: input.resourceId ?? null,
          requestHash: hash,
          status: "IN_PROGRESS",
          expiresAt: input.expiresAt ?? null,
        },
      });
      return { outcome: "NEW", record };
    } catch {
      // Concurrent first-time insert lost the unique-constraint race; treat as replay if
      // the winner used the same hash, otherwise conflict.
      const winner = await this.db.idempotencyRecord.findFirst({
        where: {
          companyId: input.companyId,
          operationType: input.operationType,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (!winner) throw CoreError.of("INTERNAL_ERROR", "Idempotency registration failed.");
      if (winner.requestHash !== hash) {
        throw CoreError.of("IDEMPOTENCY_CONFLICT", "Idempotency key reused with a different request.", {
          details: { idempotencyKey: input.idempotencyKey, operationType: input.operationType },
        });
      }
      return { outcome: "REPLAY", record: winner };
    }
  }

  /** Record the completed result for a previously-registered operation. */
  async complete(recordId: string, response: unknown): Promise<IdempotencyRecord> {
    return this.db.idempotencyRecord.update({
      where: { id: recordId },
      data: { status: "COMPLETED", responseJson: (response ?? null) as object },
    });
  }

  /** Mark a registered operation FAILED (so a retry with the same request can proceed). */
  async fail(recordId: string): Promise<IdempotencyRecord> {
    return this.db.idempotencyRecord.update({
      where: { id: recordId },
      data: { status: "FAILED" },
    });
  }
}
