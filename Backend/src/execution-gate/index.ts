/**
 * Execution-gate module barrel — Phase 9 (Transaction Gate only).
 *
 * Deterministic transaction matching + simulation binding. NOTE: this is the Phase 9
 * Transaction Gate, not the Phase 12 Final Revalidation / Execution Gate (not built).
 */
export {
  normalizeToTransactionIntent,
  compareProposalVsTransaction,
  transactionPayloadHash,
  validateSimulationBinding,
  classifySimulation,
} from "./transaction-gate.js";
export type {
  TransactionGateStatus,
  TransactionGateResult,
  FieldMismatch,
  SimulationBindingStatus,
  SimulationBindingResult,
  SimulationOutcome,
} from "./transaction-gate.js";
export { FinalRevalidationService } from "./final-revalidation.service.js";
export type {
  RevalidateInput,
  RevalidationOutcome,
  FinalRevalidationDeps,
} from "./final-revalidation.service.js";
export { ExecutionResultService } from "./execution-result.service.js";
export type {
  ExecutionResultInput,
  AuthorizedReceipt,
  ReconcileOutcome,
} from "./execution-result.service.js";
