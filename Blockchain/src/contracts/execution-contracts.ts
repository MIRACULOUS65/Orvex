/**
 * Local mirror of the FROZEN Core execution/transaction contracts.
 *
 * These are copied (not re-designed) from Backend `shared/contracts/{execution,transaction}.ts`
 * so this package is self-contained and can be tested without importing Backend. The shapes
 * MUST stay structurally identical to Core; the BaseSepoliaExecutionClient returns exactly
 * these shapes so Core consumes them unchanged. Money is always a decimal STRING.
 *
 * If Core's contracts change, update this mirror to match — never diverge silently.
 */
import { z } from "zod";

const idString = z.string().min(1);
const isoTimestamp = z.string().min(1);
const moneyAmount = z.string().min(1);

// ---- TransactionIntent (§22) ------------------------------------------- //
export const AssetRef = z
  .object({ symbol: z.string(), address: z.string().nullish(), type: z.string().nullish() })
  .strict();
export type AssetRef = z.infer<typeof AssetRef>;

export const TransactionRecipient = z
  .object({ address: z.string(), type: z.string().nullish() })
  .strict();
export type TransactionRecipient = z.infer<typeof TransactionRecipient>;

export const TransactionIntent = z
  .object({
    schema_version: z.literal("transaction_intent.v1").default("transaction_intent.v1"),
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

// ---- TransactionRequest (§23) ------------------------------------------ //
export const ChainRef = z.object({ id: z.number().int(), name: z.string() }).strict();
export type ChainRef = z.infer<typeof ChainRef>;

export const TransactionRequest = z
  .object({
    schema_version: z.literal("transaction_request.v1").default("transaction_request.v1"),
    transaction_id: idString,
    chain: ChainRef,
    from: z.string(),
    to: z.string(),
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

// ---- TransactionAnalysis (§24) ----------------------------------------- //
export const TransactionAnalysisStatus = z.enum(["VALID", "SUSPICIOUS", "INVALID"]);
export type TransactionAnalysisStatus = z.infer<typeof TransactionAnalysisStatus>;

export const ContractRef = z.object({ address: z.string(), verified: z.boolean() }).strict();
export type ContractRef = z.infer<typeof ContractRef>;

export const FunctionRef = z.object({ name: z.string(), selector: z.string() }).strict();
export type FunctionRef = z.infer<typeof FunctionRef>;

export const TransactionAnalysis = z
  .object({
    schema_version: z.literal("transaction_analysis.v1").default("transaction_analysis.v1"),
    transaction_id: idString,
    contract: ContractRef,
    function: FunctionRef,
    decoded_arguments: z.record(z.string(), z.unknown()).default({}),
    state_changes_expected: z.array(z.record(z.string(), z.unknown())).default([]),
    recipient: z.string(),
    amount: moneyAmount,
    asset: z.string(),
    risk_flags: z.array(z.string()).default([]),
    status: TransactionAnalysisStatus,
  })
  .strict();
export type TransactionAnalysis = z.infer<typeof TransactionAnalysis>;

// ---- SimulationResult (§25) -------------------------------------------- //
export const SimulationStatus = z.enum([
  "PASS",
  "REVERT",
  "UNEXPECTED_STATE_CHANGE",
  "INSUFFICIENT_FUNDS",
  "UNSUPPORTED",
  "ERROR",
]);
export type SimulationStatus = z.infer<typeof SimulationStatus>;

export const GasEstimate = z.object({ gas: z.string() }).strict();
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

export const SimulatorRef = z.object({ provider: z.string(), version: z.string() }).strict();
export type SimulatorRef = z.infer<typeof SimulatorRef>;

export const SimulationResult = z
  .object({
    schema_version: z.literal("simulation_result.v1").default("simulation_result.v1"),
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

// ---- ExecutionRequest (§34) -------------------------------------------- //
export const Executor = z.object({ type: z.string(), account: z.string() }).strict();
export type Executor = z.infer<typeof Executor>;

export const ExecutionRequest = z
  .object({
    schema_version: z.literal("execution_request.v1").default("execution_request.v1"),
    execution_id: idString,
    decision_id: idString,
    transaction_id: idString,
    executor: Executor,
    payment_method: z.string(),
    network: z.string(),
    idempotency_key: z.string(),
    authorization_context_hash: z.string(),
    created_at: isoTimestamp,
  })
  .strict();
export type ExecutionRequest = z.infer<typeof ExecutionRequest>;

// ---- ExecutionResult (§36) --------------------------------------------- //
export const ExecutionStatus = z.enum(["CONFIRMED", "PENDING", "FAILED", "UNKNOWN"]);
export type ExecutionStatus = z.infer<typeof ExecutionStatus>;

export const ExecutionResult = z
  .object({
    schema_version: z.literal("execution_result.v1").default("execution_result.v1"),
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

// ---- ReceiptVerification (§37) ----------------------------------------- //
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
    schema_version: z.literal("receipt_verification.v1").default("receipt_verification.v1"),
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

// ---- The frozen ExecutionClient interface (source of truth: Core) ------ //
export interface AnalyzeTransactionRequest {
  transactionId: string;
  network: string;
  recipient: string;
  amount: string;
  asset: string;
}

export interface SimulateRequest {
  transactionId: string;
  network: string;
}

/**
 * The EXACT Core execution boundary. BaseSepoliaExecutionClient implements this without
 * modification so Core can consume it in place of MockExecutionClient.
 */
export interface ExecutionClient {
  validateTransaction(req: AnalyzeTransactionRequest): Promise<TransactionAnalysis>;
  simulate(req: SimulateRequest): Promise<SimulationResult>;
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
  getResult(executionId: string): Promise<ExecutionResult>;
  verify(executionId: string): Promise<ReceiptVerification>;
}
