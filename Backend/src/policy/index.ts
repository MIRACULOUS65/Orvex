/**
 * Policy module barrel — Phase 4.
 *
 * The deterministic policy system: lifecycle (PolicyService), the rule engine
 * (PolicyEngine), and the compiled rule model + evaluators. No LLM is involved anywhere
 * in this module.
 */
export { PolicyService } from "./policy.service.js";
export type { CreateDraftInput } from "./policy.service.js";
export { PolicyEngine } from "./engine/engine.js";
export type {
  PolicyEvaluationOut,
  PolicyEvaluationStatus,
  PolicyViolationOut,
  EvaluateInput,
} from "./engine/engine.js";
export { EVALUATORS } from "./rules/evaluators.js";
export {
  RULE_TYPES,
  validateCompiledRules,
} from "./rules/types.js";
export type {
  CompiledRule,
  EvaluationContext,
  RuleType,
  RuleOutcome,
  RuleResult,
  CumulativeWindow,
} from "./rules/types.js";
