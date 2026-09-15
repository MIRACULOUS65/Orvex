/**
 * Approval module barrel — Phase 11.
 *
 * Human approval bound to the exact decision context. Approval is one required input to
 * authorization, never the authorization itself.
 */
export { ApprovalService, APPROVER_ROLES, NON_APPROVER_ROLES } from "./approval.service.js";
export type { CreateApprovalInput, Approver, ApproverRole } from "./approval.service.js";
