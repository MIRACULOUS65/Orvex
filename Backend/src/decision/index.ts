/**
 * Decision module barrel — Phase 10.
 *
 * The deterministic Decision Engine (ALLOW/REVIEW/DENY + context hash) and its
 * append-only persistence. Authorization lives here; AI is never authority.
 */
export { DecisionEngine } from "./engine.js";
export type {
  DecisionResult,
  DecisionInput,
  DecisionOutput,
  DecisionHashContext,
  ApprovalState,
} from "./engine.js";
export { DecisionService } from "./decision.service.js";
export type { PersistDecisionInput } from "./decision.service.js";
