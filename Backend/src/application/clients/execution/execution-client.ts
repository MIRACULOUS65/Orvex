/**
 * ExecutionClient boundary — Phase 12 (Tasks 12.3/12.4).
 *
 * Core says "this exact execution is authorized"; the Execution subsystem (Person 4)
 * actually executes it. Core NEVER imports viem/ethers/RPC/signer/smart-account
 * internals and holds no private keys. This is the abstract seam; the real
 * implementation lives in Person 4's Blockchain subsystem.
 *
 * The mock is a clearly-labeled deterministic placeholder for testing the Core flow. It
 * never touches a chain and must never be used as evidence of a real on-chain result.
 */
import type {
  ExecutionRequest,
  ExecutionResult,
  ReceiptVerification,
  SimulationResult,
  TransactionAnalysis,
} from "../../../shared/contracts/index.js";
import type { AnalyzeTransactionRequest, SimulateRequest } from "./types.js";

/**
 * The full execution boundary interface (§12.3). Implementation is Person 4's.
 */
export interface ExecutionClient {
  validateTransaction(req: AnalyzeTransactionRequest): Promise<TransactionAnalysis>;
  simulate(req: SimulateRequest): Promise<SimulationResult>;
  /** Submit an already-authorized ExecutionRequest for actual execution. */
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
  /** Fetch the raw execution result/receipt for reconciliation. */
  getResult(executionId: string): Promise<ExecutionResult>;
  /** Independent verification of what actually happened vs what was expected. */
  verify(executionId: string): Promise<ReceiptVerification>;
}

/**
 * A deterministic mock ExecutionClient. Configurable outcome so tests can drive
 * SUBMITTED/CONFIRMED/FAILED/UNKNOWN and matching/mismatching receipts. NOT a chain.
 */
export interface MockExecutionConfig {
  resultStatus?: ExecutionResult["status"];
  transactionHash?: string | null;
  /** Actual receipt values (to simulate a mismatch vs the authorized expected values). */
  actual?: { recipient: string; asset: string; amount: string; network: string };
  verified?: boolean;
}

export class MockExecutionClient implements ExecutionClient {
  constructor(private readonly config: MockExecutionConfig = {}) {}

  async validateTransaction(req: AnalyzeTransactionRequest): Promise<TransactionAnalysis> {
    return {
      schema_version: "transaction_analysis.v1",
      transaction_id: req.transactionId,
      contract: { address: "0xmock", verified: true },
      function: { name: "transfer", selector: "0xa9059cbb" },
      decoded_arguments: { to: req.recipient, amount: req.amount },
      state_changes_expected: [],
      recipient: req.recipient,
      amount: req.amount,
      asset: req.asset,
      risk_flags: [],
      status: "VALID",
    };
  }

  async simulate(req: SimulateRequest): Promise<SimulationResult> {
    return {
      schema_version: "simulation_result.v1",
      transaction_id: req.transactionId,
      status: "PASS",
      would_revert: false,
      gas_estimate: { gas: "21000" },
      expected_state_changes: [],
      unexpected_state_changes: [],
      revert_reason: null,
      simulator: { provider: "mock-simulator", version: "0.0.0" },
      simulated_at: new Date().toISOString(),
    };
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    return {
      schema_version: "execution_result.v1",
      execution_id: request.execution_id,
      status: this.config.resultStatus ?? "CONFIRMED",
      transaction_hash: this.config.transactionHash ?? "0xmocktxhash",
      chain: request.network,
      submitted_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
      receipt_reference: null,
      idempotency_key: request.idempotency_key,
    };
  }

  async getResult(executionId: string): Promise<ExecutionResult> {
    return {
      schema_version: "execution_result.v1",
      execution_id: executionId,
      status: this.config.resultStatus ?? "CONFIRMED",
      transaction_hash: this.config.transactionHash ?? "0xmocktxhash",
      chain: this.config.actual?.network ?? "base-sepolia",
      idempotency_key: "reconcile",
    };
  }

  async verify(executionId: string): Promise<ReceiptVerification> {
    const actual = this.config.actual ?? {
      recipient: "0xrecipient",
      asset: "USDC",
      amount: "5.00",
      network: "base-sepolia",
    };
    return {
      schema_version: "receipt_verification.v1",
      execution_id: executionId,
      verified: this.config.verified ?? true,
      transaction_hash: this.config.transactionHash ?? "0xmocktxhash",
      expected: actual,
      actual,
      discrepancies: [],
      verified_at: new Date().toISOString(),
    };
  }
}
