/**
 * Execution/analysis provider seams — Phase 8 minimal interfaces (Tasks 8.5-8.7).
 *
 * Phase 8 only needs the INTERFACES to request a TransactionAnalysis and a
 * SimulationResult from the (later) Execution subsystem (Person 4). The blockchain
 * implementation is NOT built here — that is Phase 9+. These interfaces let the
 * orchestrator prepare/attach analysis + simulation to the decision context without
 * coupling to any concrete provider.
 *
 * A `MockTransactionAnalysisProvider` / `MockSimulationProvider` are provided as
 * clearly-labeled deterministic placeholders (never fake real chain results): they
 * echo back a deterministic VALID/PASS shape so the orchestration flow can be tested
 * end-to-end before the real Execution service exists.
 */
import type {
  TransactionAnalysis,
  SimulationResult,
} from "../../../shared/contracts/index.js";

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

/** Person 4's transaction-analysis provider (interface only in this phase). */
export interface TransactionAnalysisProvider {
  analyze(req: AnalyzeTransactionRequest): Promise<TransactionAnalysis>;
}

/** Person 4's simulation provider (interface only in this phase). */
export interface SimulationProvider {
  simulate(req: SimulateRequest): Promise<SimulationResult>;
}

/**
 * Deterministic, clearly-labeled mock analysis provider. Returns a VALID analysis that
 * simply reflects the request. It does NOT talk to any chain and must never be used as
 * evidence of a real on-chain result.
 */
export class MockTransactionAnalysisProvider implements TransactionAnalysisProvider {
  async analyze(req: AnalyzeTransactionRequest): Promise<TransactionAnalysis> {
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
}

/** Deterministic, clearly-labeled mock simulation provider (PASS). Not a real chain. */
export class MockSimulationProvider implements SimulationProvider {
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
}
