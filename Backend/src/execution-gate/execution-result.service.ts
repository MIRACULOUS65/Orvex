/**
 * Execution Result, Reconciliation, Receipt Verification — Phase 13 (Tasks 13.1-13.7).
 *
 * Consumes the real execution outcome SAFELY. The Execution subsystem (Person 4) reports
 * an ExecutionResult; Core validates its binding to an authorized ExecutionRequest,
 * verifies the actual on-chain result against what was authorized, and finalizes the
 * financial reservation.
 *
 * Safety rules enforced here:
 *   - A result for an unknown/wrong execution_id is REJECTED (never trusted).
 *   - UNKNOWN outcome => reconcile (query the authoritative layer), NEVER blind-retry,
 *     and the reservation stays HELD (not released, not committed).
 *   - Business commit (reserved -> committed) happens ONLY after CONFIRMED + VERIFIED.
 *   - Confirmed failure => reserved -> released. A verification mismatch is NOT a
 *     business success and never commits.
 *   - Financial finalization reuses the concurrency-safe, idempotent FinancialService.
 */
import type {
  ExecutionRequestRecord,
  ExecutionResultRecord,
  PrismaClient,
  ReceiptVerificationRecord,
} from "@prisma/client";
import { CoreError } from "../shared/errors/index.js";
import { toDecimal } from "../shared/money.js";
import { FinancialService } from "../domain/index.js";
import type { ExecutionClient } from "../application/clients/execution/index.js";

/** What the executor reports back (subset of the ExecutionResult contract). */
export interface ExecutionResultInput {
  executionId: string;
  status: "SUBMITTED" | "CONFIRMED" | "FAILED" | "UNKNOWN";
  chain: string;
  transactionHash?: string | null;
  submittedAt?: string | null;
  confirmedAt?: string | null;
  /** Proof the result came from the authenticated Execution service (auth boundary). */
  authenticated: boolean;
}

/** The authorized receipt values (what Core authorized) for verification. */
export interface AuthorizedReceipt {
  recipient: string;
  asset: string;
  amount: string;
  network: string;
}

export interface ReconcileOutcome {
  status: "CONFIRMED" | "FAILED" | "STILL_UNKNOWN";
}

export class ExecutionResultService {
  private readonly financial: FinancialService;

  constructor(
    private readonly db: PrismaClient,
    private readonly executionClient: ExecutionClient,
  ) {
    this.financial = new FinancialService(db);
  }

  /**
   * Ingest an ExecutionResult. Validates that it is authenticated and bound to a real,
   * company-scoped ExecutionRequest, then records it and advances the request status.
   * Rejects forged (unauthenticated) or mis-bound results.
   */
  async ingestResult(companyId: string, input: ExecutionResultInput): Promise<ExecutionResultRecord> {
    // Auth boundary: an unauthenticated (forged) result is never accepted.
    if (!input.authenticated) {
      throw CoreError.of("AUTHENTICATION_ERROR", "Execution result is not from the authenticated executor.", {
        details: { executionId: input.executionId },
      });
    }
    const request = await this.db.executionRequestRecord.findFirst({
      where: { id: input.executionId, companyId },
    });
    if (!request) {
      throw CoreError.of("EXECUTION_FAILED", "Execution result references an unknown execution_id.", {
        details: { executionId: input.executionId },
      });
    }
    // Network binding: the result's chain must match the authorized network.
    if (input.chain !== request.network) {
      throw CoreError.of("TRANSACTION_MISMATCH", "Execution result network does not match authorization.", {
        details: { expected: request.network, actual: input.chain },
      });
    }

    const record = await this.db.executionResultRecord.create({
      data: {
        executionRequestId: request.id,
        transactionHash: input.transactionHash ?? null,
        status: input.status,
        chain: input.chain,
        submittedAt: input.submittedAt ? new Date(input.submittedAt) : null,
        confirmedAt: input.confirmedAt ? new Date(input.confirmedAt) : null,
      },
    });

    // Advance the execution request status to mirror the result.
    await this.db.executionRequestRecord.update({
      where: { id: request.id },
      data: { status: input.status },
    });

    // UNKNOWN: reservation is HELD (mark UNKNOWN). No release, no commit, no retry here.
    if (input.status === "UNKNOWN") {
      await this.holdReservation(companyId, request.id);
    }
    // FAILED: confirmed failure releases the reservation.
    if (input.status === "FAILED") {
      await this.releaseReservation(companyId, request.id);
    }

    return record;
  }

  /**
   * Reconcile an UNKNOWN execution by querying the authoritative execution layer. Does
   * NOT blind-retry the payment; only resolves the true outcome. The reservation remains
   * HELD until this resolves to CONFIRMED (later committed on verify) or FAILED (released).
   */
  async reconcile(companyId: string, executionId: string): Promise<ReconcileOutcome> {
    const request = await this.db.executionRequestRecord.findFirst({
      where: { id: executionId, companyId },
    });
    if (!request) {
      throw CoreError.of("EXECUTION_FAILED", "Unknown execution_id for reconciliation.", {
        details: { executionId },
      });
    }
    const authoritative = await this.executionClient.getResult(executionId);
    if (authoritative.status === "CONFIRMED") {
      await this.db.executionRequestRecord.update({ where: { id: request.id }, data: { status: "CONFIRMED" } });
      return { status: "CONFIRMED" };
    }
    if (authoritative.status === "FAILED") {
      await this.db.executionRequestRecord.update({ where: { id: request.id }, data: { status: "FAILED" } });
      // Reconciliation is the authoritative path that may release an UNKNOWN hold.
      const held = await this.db.financialReservation.findFirst({
        where: { companyId, executionRequestId: request.id, status: { in: ["RESERVED", "UNKNOWN"] } },
      });
      if (held) await this.financial.reconcileRelease(companyId, held.id);
      return { status: "FAILED" };
    }
    // Still unknown: keep the reservation HELD, do not retry.
    return { status: "STILL_UNKNOWN" };
  }

  /**
   * Verify the actual on-chain result against what Core authorized, then finalize the
   * financial state. VERIFIED + CONFIRMED => commit reservation. A mismatch =>
   * VERIFICATION_FAILED (no business commit; the reservation is NOT committed).
   */
  async verifyAndFinalize(
    companyId: string,
    executionId: string,
    authorized: AuthorizedReceipt,
  ): Promise<{ verification: ReceiptVerificationRecord; committed: boolean }> {
    const request = await this.db.executionRequestRecord.findFirst({
      where: { id: executionId, companyId },
    });
    if (!request) {
      throw CoreError.of("EXECUTION_FAILED", "Unknown execution_id for verification.", { details: { executionId } });
    }

    const receipt = await this.executionClient.verify(executionId);
    const actual: AuthorizedReceipt = {
      recipient: receipt.actual.recipient,
      asset: receipt.actual.asset,
      amount: receipt.actual.amount,
      network: receipt.actual.network,
    };

    // Deterministic authorized-vs-actual comparison.
    const discrepancies: string[] = [];
    if (authorized.recipient !== actual.recipient) discrepancies.push("recipient");
    if (authorized.asset !== actual.asset) discrepancies.push("asset");
    if (!toDecimal(authorized.amount).equals(toDecimal(actual.amount))) discrepancies.push("amount");
    if (authorized.network !== actual.network) discrepancies.push("network");
    if (!receipt.verified) discrepancies.push("executor_unverified");

    const verified = discrepancies.length === 0;

    const verification = await this.db.receiptVerificationRecord.create({
      data: {
        executionRequestId: request.id,
        status: verified ? "VERIFIED" : "MISMATCH",
        verified,
        transactionHash: receipt.transaction_hash,
        expectedJson: authorized as unknown as object,
        actualJson: actual as unknown as object,
        discrepanciesJson: discrepancies as unknown as object,
        verifiedAt: new Date(),
      },
    });

    // Financial finalization: commit ONLY on verified success. A mismatch never commits.
    let committed = false;
    if (verified) {
      const reservation = await this.db.financialReservation.findFirst({
        where: { companyId, executionRequestId: request.id, status: "RESERVED" },
      });
      if (reservation) {
        await this.financial.commit(companyId, reservation.id);
        committed = true;
      }
    }

    return { verification, committed };
  }

  private async holdReservation(companyId: string, executionRequestId: string): Promise<void> {
    const reservation = await this.db.financialReservation.findFirst({
      where: { companyId, executionRequestId, status: "RESERVED" },
    });
    if (reservation) await this.financial.markUnknown(companyId, reservation.id);
  }

  private async releaseReservation(companyId: string, executionRequestId: string): Promise<void> {
    const reservation = await this.db.financialReservation.findFirst({
      where: { companyId, executionRequestId, status: "RESERVED" },
    });
    if (reservation) await this.financial.release(companyId, reservation.id);
  }

  async getRequest(companyId: string, executionId: string): Promise<ExecutionRequestRecord | null> {
    return this.db.executionRequestRecord.findFirst({ where: { id: executionId, companyId } });
  }
}
