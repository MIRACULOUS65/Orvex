/**
 * Execution contracts — Phase 2, Task 2.1.
 *
 * Mirrors CONTRACTS.md §34/§36/§37:
 *   - ExecutionRequest     (§34) crosses from Core into the Execution layer
 *   - ExecutionResult      (§36) the executor's reported outcome
 *   - ReceiptVerification  (§37) verifies actual on-chain result vs expected
 *
 * Every executable financial operation carries a stable `idempotency_key` (§35) so
 * retries never produce duplicate payments. Core/Execution-owned, `.strict()`. Amounts
 * are decimal STRINGS (CONTRACTS.md §4.3).
 */
import { z } from "zod";
import { idString, isoTimestamp, moneyAmount } from "./primitives.js";

// ---- §34 ExecutionRequest ---------------------------------------------- //

export const Executor = z
  .object({
    type: z.string(),
    account: z.string(),
  })
  .strict();
export type Executor = z.infer<typeof Executor>;

export const ExecutionRequest = z
  .object({
    schema_version: z
      .literal("execution_request.v1")
      .default("execution_request.v1"),
    execution_id: idString,
    decision_id: idString,
    transaction_id: idString,
    executor: Executor,
    payment_method: z.string(),
    network: z.string(),
    // Stable idempotency key derived from the logical execution context (§35).
    idempotency_key: z.string(),
    authorization_context_hash: z.string(),
    created_at: isoTimestamp,
  })
  .strict();
export type ExecutionRequest = z.infer<typeof ExecutionRequest>;

// ---- §36 ExecutionResult ----------------------------------------------- //

export const ExecutionStatus = z.enum([
  "CONFIRMED",
  "PENDING",
  "FAILED",
  "UNKNOWN",
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatus>;

export const ExecutionResult = z
  .object({
    schema_version: z
      .literal("execution_result.v1")
      .default("execution_result.v1"),
    execution_id: idString,
    status: ExecutionStatus,
    transaction_hash: z.string().nullish(),
    chain: z.string(),
    submitted_at: isoTimestamp.nullish(),
    confirmed_at: isoTimestamp.nullish(),
    receipt_reference: idString.nullish(),
    idempotency_key: z.string(),
  })
  .strict();
export type ExecutionResult = z.infer<typeof ExecutionResult>;

// ---- §37 ReceiptVerification ------------------------------------------- //

/**
 * The expected/actual comparison payload. Money is a decimal string. Kept `.strict()`
 * so a verification can't silently accept an unexpected extra field.
 */
export const ReceiptSnapshot = z
  .object({
    recipient: z.string(),
    asset: z.string(),
    amount: moneyAmount,
    network: z.string(),
  })
  .strict();
export type ReceiptSnapshot = z.infer<typeof ReceiptSnapshot>;

export const ReceiptVerification = z
  .object({
    schema_version: z
      .literal("receipt_verification.v1")
      .default("receipt_verification.v1"),
    execution_id: idString,
    verified: z.boolean(),
    transaction_hash: z.string(),
    expected: ReceiptSnapshot,
    actual: ReceiptSnapshot,
    discrepancies: z.array(z.string()).default([]),
    verified_at: isoTimestamp,
  })
  .strict();
export type ReceiptVerification = z.infer<typeof ReceiptVerification>;
