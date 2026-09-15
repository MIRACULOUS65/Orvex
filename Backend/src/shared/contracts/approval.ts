/**
 * Approval contracts — Phase 2, Task 2.1.
 *
 * Mirrors CONTRACTS.md §28/§29. A human approval request is generated only when
 * policy/decision logic requires it. Per §30, an approval binds to the EXACT
 * transaction/decision context (via `decision_context_hash`); it can never mean a
 * general "user approves this agent". Core-owned, deterministic, `.strict()`.
 */
import { z } from "zod";
import { idString, isoTimestamp, moneyAmount } from "./primitives.js";

export const ApprovalSummary = z
  .object({
    purpose: z.string(),
    amount: moneyAmount,
    currency: z.string(),
    recipient: z.string(),
  })
  .strict();
export type ApprovalSummary = z.infer<typeof ApprovalSummary>;

export const ApprovalSecuritySummary = z
  .object({
    risk_level: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    threats: z.array(z.string()).default([]),
    simulation: z.string(),
  })
  .strict();
export type ApprovalSecuritySummary = z.infer<typeof ApprovalSecuritySummary>;

export const ApprovalRequest = z
  .object({
    schema_version: z.literal("approval_request.v1").default("approval_request.v1"),
    approval_id: idString,
    proposal_id: idString,
    transaction_id: idString.nullish(),
    reason: z.string(),
    summary: ApprovalSummary,
    security_summary: ApprovalSecuritySummary,
    expires_at: isoTimestamp,
    required_role: z.string(),
    created_at: isoTimestamp,
  })
  .strict();
export type ApprovalRequest = z.infer<typeof ApprovalRequest>;

export const ApprovalStatus = z.enum(["APPROVED", "DENIED", "EXPIRED", "PENDING"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;

export const ApprovalResult = z
  .object({
    schema_version: z.literal("approval_result.v1").default("approval_result.v1"),
    approval_id: idString,
    status: ApprovalStatus,
    approved_by: idString.nullish(),
    approved_at: isoTimestamp.nullish(),
    authorization_reference: z.string().nullish(),
    // Binds the approval to the exact decision context (CONTRACTS.md §30).
    decision_context_hash: z.string(),
  })
  .strict();
export type ApprovalResult = z.infer<typeof ApprovalResult>;
