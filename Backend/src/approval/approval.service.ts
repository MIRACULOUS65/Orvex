/**
 * Human Approval Engine — Phase 11 (Tasks 11.1-11.7).
 *
 * A human approval is ONE required input to authorization, never the authorization
 * itself (the Decision Engine remains authority). Invariants enforced here:
 *   - context binding (§30/§38, Task 11.5): an approval is bound to the exact decision
 *     context hash. Approving requires the current context hash to match the request's;
 *     a later material change (e.g. $5->A becomes $5->B) yields APPROVAL_MISMATCH.
 *   - expiration (Task 11.6): an expired request cannot be approved and yields EXPIRED.
 *   - approver authorization (Task 11.4): the approver must be authenticated, in the
 *     same company, and hold a role permitted to approve. AUDITOR / READ_ONLY /
 *     AGENT_SERVICE and wrong-company approvers are rejected.
 *   - state machine: PENDING -> APPROVED/DENIED/EXPIRED/CANCELLED only; terminal states
 *     are immutable (no reopening).
 */
import type {
  ApprovalRequest,
  ApprovalResult,
  ApprovalRequestStatus,
  PrismaClient,
} from "@prisma/client";
import { CoreError } from "../shared/errors/index.js";

/** Roles permitted to approve a human-review request. */
export const APPROVER_ROLES = ["ADMIN", "AUTHORIZED_OPERATOR", "APPROVER"] as const;
export type ApproverRole = string;

/** Roles explicitly forbidden from approving (documented for clarity/tests). */
export const NON_APPROVER_ROLES = ["AUDITOR", "READ_ONLY", "AGENT_SERVICE", "VIEWER"] as const;

export interface CreateApprovalInput {
  companyId: string;
  agentId: string;
  decisionId: string;
  transactionId?: string | null;
  policyVersionId?: string | null;
  requiredRole: string;
  summary: Record<string, unknown>;
  contextHash: string;
  expiresAt: Date;
}

export interface Approver {
  approverId: string;
  companyId: string;
  role: string;
}

export class ApprovalService {
  constructor(private readonly db: PrismaClient) {}

  /** Create a PENDING approval request bound to a decision + its context hash. */
  async createRequest(input: CreateApprovalInput): Promise<ApprovalRequest> {
    const decision = await this.db.decision.findFirst({
      where: { id: input.decisionId, companyId: input.companyId },
    });
    if (!decision) {
      throw CoreError.of("NOT_FOUND", "Decision not found for approval request.", {
        details: { decisionId: input.decisionId },
      });
    }
    return this.db.approvalRequest.create({
      data: {
        companyId: input.companyId,
        agentId: input.agentId,
        decisionId: input.decisionId,
        transactionId: input.transactionId ?? null,
        policyVersionId: input.policyVersionId ?? null,
        requiredRole: input.requiredRole,
        summaryJson: input.summary as unknown as object,
        contextHash: input.contextHash,
        status: "PENDING",
        expiresAt: input.expiresAt,
      },
    });
  }

  async getRequest(companyId: string, approvalId: string): Promise<ApprovalRequest | null> {
    return this.db.approvalRequest.findFirst({ where: { id: approvalId, companyId } });
  }

  private assertApproverAuthorized(request: ApprovalRequest, approver: Approver): void {
    // Wrong company can never approve.
    if (approver.companyId !== request.companyId) {
      throw CoreError.of("AUTHORIZATION_ERROR", "Approver is from a different company.", {
        details: { approverCompany: approver.companyId, requestCompany: request.companyId },
      });
    }
    // Role must be a permitted approver role AND satisfy the request's required role.
    if (!(APPROVER_ROLES as readonly string[]).includes(approver.role)) {
      throw CoreError.of("AUTHORIZATION_ERROR", "Approver role is not permitted to approve.", {
        details: { role: approver.role },
      });
    }
    if (request.requiredRole && approver.role !== request.requiredRole && approver.role !== "ADMIN") {
      throw CoreError.of("AUTHORIZATION_ERROR", "Approver role does not satisfy the required role.", {
        details: { role: approver.role, requiredRole: request.requiredRole },
      });
    }
  }

  /** Common guard: load a PENDING, non-expired request or throw. */
  private async loadPending(
    companyId: string,
    approvalId: string,
    now: Date,
  ): Promise<ApprovalRequest> {
    const request = await this.getRequest(companyId, approvalId);
    if (!request) {
      throw CoreError.of("APPROVAL_NOT_FOUND", "Approval request not found.", {
        details: { approvalId },
      });
    }
    if (request.status !== "PENDING") {
      throw CoreError.of("CONFLICT", `Approval is not PENDING (is ${request.status}).`, {
        details: { approvalId, status: request.status },
      });
    }
    if (request.expiresAt.getTime() <= now.getTime()) {
      // Auto-transition to EXPIRED and refuse.
      await this.db.approvalRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } });
      throw CoreError.of("APPROVAL_EXPIRED", "Approval request has expired.", {
        details: { approvalId, expiresAt: request.expiresAt.toISOString() },
      });
    }
    return request;
  }

  /**
   * Approve a request. Verifies approver authorization, expiration, and — critically —
   * that the CURRENT decision context hash still matches the request's bound hash. A
   * mismatch (material change since the request) yields APPROVAL_MISMATCH.
   */
  async approve(
    companyId: string,
    approvalId: string,
    approver: Approver,
    currentContextHash: string,
    now: Date = new Date(),
  ): Promise<{ request: ApprovalRequest; result: ApprovalResult }> {
    return this.db.$transaction(async (tx) => {
      const request = await this.loadPendingTx(tx, companyId, approvalId, now);
      this.assertApproverAuthorized(request, approver);

      if (request.contextHash !== currentContextHash) {
        throw CoreError.of("APPROVAL_MISMATCH", "Current context does not match the approved context.", {
          details: { approved: request.contextHash, current: currentContextHash },
        });
      }

      const updated = await tx.approvalRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED" },
      });
      const result = await tx.approvalResult.create({
        data: {
          approvalRequestId: request.id,
          decisionId: request.decisionId,
          approverId: approver.approverId,
          approverRole: approver.role,
          result: "APPROVED",
          contextHash: currentContextHash,
        },
      });
      return { request: updated, result };
    });
  }

  /** Deny a request (authorized approver required). Terminal. */
  async deny(
    companyId: string,
    approvalId: string,
    approver: Approver,
    now: Date = new Date(),
  ): Promise<{ request: ApprovalRequest; result: ApprovalResult }> {
    return this.db.$transaction(async (tx) => {
      const request = await this.loadPendingTx(tx, companyId, approvalId, now);
      this.assertApproverAuthorized(request, approver);
      const updated = await tx.approvalRequest.update({
        where: { id: request.id },
        data: { status: "DENIED" },
      });
      const result = await tx.approvalResult.create({
        data: {
          approvalRequestId: request.id,
          decisionId: request.decisionId,
          approverId: approver.approverId,
          approverRole: approver.role,
          result: "DENIED",
          contextHash: request.contextHash,
        },
      });
      return { request: updated, result };
    });
  }

  /** Cancel a pending request (system/operator). Terminal. */
  async cancel(companyId: string, approvalId: string, now: Date = new Date()): Promise<ApprovalRequest> {
    const request = await this.loadPending(companyId, approvalId, now);
    return this.db.approvalRequest.update({ where: { id: request.id }, data: { status: "CANCELLED" } });
  }

  /** Mark expired requests EXPIRED (housekeeping). Returns count. */
  async expireStale(companyId: string, now: Date = new Date()): Promise<number> {
    const res = await this.db.approvalRequest.updateMany({
      where: { companyId, status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED" },
    });
    return res.count;
  }

  /**
   * Resolve the current approval STATE for the Decision Engine (Phase 10 input). Returns
   * the ApprovalState-shaped status, applying expiration + context-hash binding.
   */
  async resolveApprovalState(
    companyId: string,
    approvalId: string,
    currentContextHash: string,
    now: Date = new Date(),
  ): Promise<"NONE" | "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" | "MISMATCH"> {
    const request = await this.getRequest(companyId, approvalId);
    if (!request) return "NONE";
    if (request.status === "EXPIRED" || (request.status === "PENDING" && request.expiresAt.getTime() <= now.getTime())) {
      return "EXPIRED";
    }
    if (request.status === "DENIED" || request.status === "CANCELLED") return "DENIED";
    if (request.status === "PENDING") return "PENDING";
    // APPROVED — but a later context change invalidates it.
    if (request.contextHash !== currentContextHash) return "MISMATCH";
    return "APPROVED";
  }

  // Transaction-scoped variant of loadPending (uses the tx client for locking).
  private async loadPendingTx(
    tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
    companyId: string,
    approvalId: string,
    now: Date,
  ): Promise<ApprovalRequest> {
    const request = await tx.approvalRequest.findFirst({ where: { id: approvalId, companyId } });
    if (!request) {
      throw CoreError.of("APPROVAL_NOT_FOUND", "Approval request not found.", { details: { approvalId } });
    }
    if ((["APPROVED", "DENIED", "EXPIRED", "CANCELLED"] as ApprovalRequestStatus[]).includes(request.status)) {
      throw CoreError.of("CONFLICT", `Approval is terminal (${request.status}); cannot reopen.`, {
        details: { approvalId, status: request.status },
      });
    }
    if (request.expiresAt.getTime() <= now.getTime()) {
      await tx.approvalRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } });
      throw CoreError.of("APPROVAL_EXPIRED", "Approval request has expired.", {
        details: { approvalId },
      });
    }
    return request;
  }
}
