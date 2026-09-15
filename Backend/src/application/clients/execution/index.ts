/**
 * Execution client barrel — Phase 8/12.
 *
 * The abstract execution boundary (Person 4 implements the real chain interaction) plus
 * clearly-labeled deterministic mocks. Core holds no keys and never talks to a chain.
 */
export {
  MockTransactionAnalysisProvider,
  MockSimulationProvider,
} from "./types.js";
export type {
  TransactionAnalysisProvider,
  SimulationProvider,
  AnalyzeTransactionRequest,
  SimulateRequest,
} from "./types.js";
export { MockExecutionClient } from "./execution-client.js";
export type { ExecutionClient, MockExecutionConfig } from "./execution-client.js";
