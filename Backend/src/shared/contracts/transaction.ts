/**
 * Transaction contracts — Phase 2, Task 2.1.
 *
 * Mirrors CONTRACTS.md §22-25:
 *   - TransactionIntent    (§22) normalized approved proposal
 *   - TransactionRequest   (§23) concrete transaction candidate for validation/sim
 *   - TransactionAnalysis  (§24) decoded/analyzed transaction pre-signing
 *   - SimulationResult     (§25) deterministic execution analysis (never LLM-generated)
 *
 * All are Core/Execution-owned deterministic objects (`.strict()`). Amounts are decimal
 * STRINGS (CONTRACTS.md §4.3).
 */
import { z } from "zod";
import { idString, isoTimestamp, moneyAmount } from "./primitives.js";

// ---- §22 TransactionIntent --------------------------------------------- //

export const AssetRef = z
  .object({
    symbol: z.string(),
    address: z.string().nullish(),
    type: z.string().nullish(),
  })
  .strict();
export type AssetRef = z.infer<typeof AssetRef>;

export const TransactionRecipient = z
  .object({
    address: z.string(),
    type: z.string().nullish(),
  })
  .strict();
export type TransactionRecipient = z.infer<typeof TransactionRecipient>;

export const TransactionIntent = z
  .object({
    schema_version: z
      .literal("transaction_intent.v1")
      .default("transaction_intent.v1"),
    transaction_id: idString,
    proposal_id: idString,
    action_type: z.string(),
    network: z.string(),
    asset: AssetRef,
    amount: moneyAmount,
    recipient: TransactionRecipient,
    payment_method: z.string().nullish(),
    constraints: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type TransactionIntent = z.infer<typeof TransactionIntent>;

// ---- §23 TransactionRequest -------------------------------------------- //

export const ChainRef = z
  .object({
    id: z.number().int(),
    name: z.string(),
  })
  .strict();
export type ChainRef = z.infer<typeof ChainRef>;

export const TransactionRequest = z
  .object({
    schema_version: z
      .literal("transaction_request.v1")
      .default("transaction_request.v1"),
    transaction_id: idString,
    chain: ChainRef,
    from: z.string(),
    to: z.string(),
    // `value` here is the raw chain value field (e.g. native wei as a string), kept
    // as a decimal string to avoid float precision loss.
    value: moneyAmount,
    data: z.string(),
    asset: AssetRef,
    amount: moneyAmount,
    proposal_id: idString,
    intent_id: idString,
    created_at: isoTimestamp,
  })
  .strict();
export type TransactionRequest = z.infer<typeof TransactionRequest>;

// ---- §24 TransactionAnalysis ------------------------------------------- //

export const TransactionAnalysisStatus = z.enum(["VALID", "SUSPICIOUS", "INVALID"]);
export type TransactionAnalysisStatus = z.infer<typeof TransactionAnalysisStatus>;

export const ContractRef = z
  .object({
    address: z.string(),
    verified: z.boolean(),
  })
  .strict();
export type ContractRef = z.infer<typeof ContractRef>;

export const FunctionRef = z
  .object({
    name: z.string(),
    selector: z.string(),
  })
  .strict();
export type FunctionRef = z.infer<typeof FunctionRef>;

export const TransactionAnalysis = z
  .object({
    schema_version: z
      .literal("transaction_analysis.v1")
      .default("transaction_analysis.v1"),
    transaction_id: idString,
    contract: ContractRef,
    function: FunctionRef,
    decoded_arguments: z.record(z.string(), z.unknown()).default({}),
    state_changes_expected: z
      .array(z.record(z.string(), z.unknown()))
      .default([]),
    recipient: z.string(),
    amount: moneyAmount,
    asset: z.string(),
    risk_flags: z.array(z.string()).default([]),
    status: TransactionAnalysisStatus,
  })
  .strict();
export type TransactionAnalysis = z.infer<typeof TransactionAnalysis>;

// ---- §25 SimulationResult ---------------------------------------------- //

export const SimulationStatus = z.enum([
  "PASS",
  "REVERT",
  "UNEXPECTED_STATE_CHANGE",
  "INSUFFICIENT_FUNDS",
  "UNSUPPORTED",
  "ERROR",
]);
export type SimulationStatus = z.infer<typeof SimulationStatus>;

export const GasEstimate = z
  .object({
    gas: z.string(),
  })
  .strict();
export type GasEstimate = z.infer<typeof GasEstimate>;

export const StateChange = z
  .object({
    type: z.string(),
    asset: z.string().nullish(),
    from: z.string().nullish(),
    to: z.string().nullish(),
    amount: moneyAmount.nullish(),
  })
  .strict();
export type StateChange = z.infer<typeof StateChange>;

export const SimulatorRef = z
  .object({
    provider: z.string(),
    version: z.string(),
  })
  .strict();
export type SimulatorRef = z.infer<typeof SimulatorRef>;

export const SimulationResult = z
  .object({
    schema_version: z
      .literal("simulation_result.v1")
      .default("simulation_result.v1"),
    transaction_id: idString,
    status: SimulationStatus,
    would_revert: z.boolean(),
    gas_estimate: GasEstimate.nullish(),
    expected_state_changes: z.array(StateChange).default([]),
    unexpected_state_changes: z.array(StateChange).default([]),
    revert_reason: z.string().nullable().default(null),
    simulator: SimulatorRef,
    simulated_at: isoTimestamp,
  })
  .strict();
export type SimulationResult = z.infer<typeof SimulationResult>;
