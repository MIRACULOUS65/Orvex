/**
 * Forensic reconstruction — Phase 14 (Task 14.7).
 *
 * Given an execution_id, reconstruct the complete authoritative lifecycle from durable
 * Core state. This is the "reconstructable audit" guarantee: every financial decision
 * can be traced end-to-end. It reads only persisted rows (no recomputation of authority)
 * and is company-scoped.
 *
 * The reconstruction links: ExecutionRequest -> Decision -> (policy version) -> Approval
 * -> ExecutionResult(s) -> ReceiptVerification(s) -> FinancialReservation -> Attestation
 * plus the audit-event timeline for the execution entity.
 */
import type { PrismaClient } from "@prisma/client";
import { AuditService } from "./audit.service.js";

export interface ForensicRecord {
  executionRequest: unknown;
  decision: unknown;
  approvalRequests: unknown[];
  executionResults: unknown[];
  receiptVerifications: unknown[];
  financialReservations: unknown[];
  attestations: unknown[];
  auditTimeline: unknown[];
  /** True when every referenced stage is present (a complete lifecycle). */
  complete: boolean;
}

export class ForensicReconstructionService {
  private readonly audit: AuditService;
  constructor(private readonly db: PrismaClient) {
    this.audit = new AuditService(db);
  }

  async reconstruct(companyId: string, executionId: string): Promise<ForensicRecord | null> {
    const executionRequest = await this.db.executionRequestRecord.findFirst({
      where: { id: executionId, companyId },
    });
    if (!executionRequest) return null;

    const [decision, approvalRequests, executionResults, receiptVerifications, financialReservations, attestations, auditTimeline] =
      await Promise.all([
        this.db.decision.findFirst({ where: { id: executionRequest.decisionId, companyId } }),
        this.db.approvalRequest.findMany({ where: { decisionId: executionRequest.decisionId, companyId } }),
        this.db.executionResultRecord.findMany({ where: { executionRequestId: executionId } }),
        this.db.receiptVerificationRecord.findMany({ where: { executionRequestId: executionId } }),
        this.db.financialReservation.findMany({ where: { executionRequestId: executionId, companyId } }),
        this.db.attestationRecord.findMany({ where: { executionRequestId: executionId, companyId } }),
        this.audit.getEntityTimeline(companyId, "EXECUTION", executionId),
      ]);

    const complete =
      !!executionRequest &&
      !!decision &&
      executionResults.length > 0 &&
      receiptVerifications.length > 0 &&
      financialReservations.length > 0;

    return {
      executionRequest,
      decision,
      approvalRequests,
      executionResults,
      receiptVerifications,
      financialReservations,
      attestations,
      auditTimeline,
      complete,
    };
  }
}
