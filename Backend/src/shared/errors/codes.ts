/**
 * Backend error taxonomy — Phase 1, Task 1.6.
 *
 * The canonical machine-readable error vocabulary. Merges the shared codes from
 * CONTRACTS.md §44 with the Backend-specific codes in BACKEND_API.md §13 and
 * PRD_BACKEND_CORE.md §85. No unhandled exception may reach a client as a raw
 * stack trace (BACKEND_SECURITY.md §80).
 */
export const ERROR_CODES = [
  // ---- Input / auth / tenant ----
  "INVALID_INPUT",
  "SCHEMA_ERROR",
  "AUTHENTICATION_ERROR",
  "AUTHORIZATION_ERROR",
  "TENANT_ERROR",

  // ---- Identity / lifecycle ----
  "AGENT_NOT_FOUND",
  "AGENT_INACTIVE",
  "INTENT_INVALID",
  "INTENT_EXPIRED",
  "PROPOSAL_INVALID",
  "CAPABILITY_INVALID",
  "CAPABILITY_EXPIRED",

  // ---- Policy ----
  "POLICY_INVALID",
  "POLICY_CONFLICT",
  "POLICY_VIOLATION",

  // ---- Security intelligence ----
  "SECURITY_ASSESSMENT_INVALID",
  "SECURITY_ASSESSMENT_STALE",
  "INSUFFICIENT_EVIDENCE",

  // ---- Transaction / simulation ----
  "TRANSACTION_INVALID",
  "TRANSACTION_MISMATCH",
  "SIMULATION_FAILED",
  "SIMULATION_STALE",

  // ---- Approval ----
  "APPROVAL_REQUIRED",
  "APPROVAL_NOT_FOUND",
  "APPROVAL_EXPIRED",
  "APPROVAL_MISMATCH",
  "APPROVAL_DENIED",

  // ---- Decision / execution ----
  "DECISION_STALE",
  "EXECUTION_BLOCKED",
  "EXECUTION_FAILED",
  "EXECUTION_UNKNOWN",
  "RECEIPT_MISMATCH",

  // ---- Concurrency / idempotency ----
  "CONCURRENCY_CONFLICT",
  "IDEMPOTENCY_CONFLICT",

  // ---- Infra / generic ----
  "PROVIDER_ERROR",
  "TIMEOUT",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "CONFIGURATION_ERROR",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ErrorSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** Default HTTP status for each code. */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  SCHEMA_ERROR: 422,
  AUTHENTICATION_ERROR: 401,
  AUTHORIZATION_ERROR: 403,
  TENANT_ERROR: 403,

  AGENT_NOT_FOUND: 404,
  AGENT_INACTIVE: 409,
  INTENT_INVALID: 422,
  INTENT_EXPIRED: 409,
  PROPOSAL_INVALID: 422,
  CAPABILITY_INVALID: 422,
  CAPABILITY_EXPIRED: 409,

  POLICY_INVALID: 422,
  POLICY_CONFLICT: 409,
  POLICY_VIOLATION: 403,

  SECURITY_ASSESSMENT_INVALID: 422,
  SECURITY_ASSESSMENT_STALE: 409,
  INSUFFICIENT_EVIDENCE: 422,

  TRANSACTION_INVALID: 422,
  TRANSACTION_MISMATCH: 409,
  SIMULATION_FAILED: 422,
  SIMULATION_STALE: 409,

  APPROVAL_REQUIRED: 403,
  APPROVAL_NOT_FOUND: 404,
  APPROVAL_EXPIRED: 409,
  APPROVAL_MISMATCH: 409,
  APPROVAL_DENIED: 403,

  DECISION_STALE: 409,
  EXECUTION_BLOCKED: 403,
  EXECUTION_FAILED: 502,
  EXECUTION_UNKNOWN: 502,
  RECEIPT_MISMATCH: 409,

  CONCURRENCY_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,

  PROVIDER_ERROR: 502,
  TIMEOUT: 504,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  CONFIGURATION_ERROR: 500,
  INTERNAL_ERROR: 500,
};

/** Whether a code is safe to retry (advisory hint for clients). */
export const ERROR_RETRYABLE: Partial<Record<ErrorCode, boolean>> = {
  TIMEOUT: true,
  RATE_LIMITED: true,
  PROVIDER_ERROR: true,
  EXECUTION_UNKNOWN: false, // must be reconciled, never blindly retried
  CONCURRENCY_CONFLICT: true,
};
