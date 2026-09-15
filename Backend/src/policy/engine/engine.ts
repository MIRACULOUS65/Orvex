/**
 * Deterministic Policy Engine — Phase 4, Tasks 4.3 / 4.13.
 *
 * Consumes a compiled rule set + an EvaluationContext and produces a PolicyEvaluation
 * (CONTRACTS.md §26). Fully deterministic: no LLM, no model inference, no wall-clock
 * reads (the clock is supplied via ctx.now). Rules are evaluated in priority order so
 * results are stable and reproducible.
 *
 * Aggregate status (§26 / §32 precedence):
 *   - any VIOLATION            -> FAIL   (decision cannot be ALLOW)
 *   - else any REQUIRE_APPROVAL
 *     or REVIEW                -> REVIEW (human approval / review required)
 *   - else                     -> PASS
 *
 * AI risk signals CANNOT override a deterministic hard block — this engine never even
 * sees a risk score; it only sees structured authoritative context.
 */
import { randomUUID } from "node:crypto";
import { sha256Json } from "../../shared/hash.js";
import { EVALUATORS } from "../rules/evaluators.js";
import type { CompiledRule, EvaluationContext, RuleOutcome } from "../rules/types.js";

export type PolicyEvaluationStatus = "PASS" | "FAIL" | "REVIEW";

export interface PolicyViolationOut {
  violation_id: string;
  rule_id: string;
  rule_type: string;
  field?: string;
  actual_value?: string;
  expected?: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  message: string;
}

export interface PolicyEvaluationOut {
  schema_version: "policy_evaluation.v1";
  policy_id: string;
  policy_version: number;
  status: PolicyEvaluationStatus;
  rules_checked: Array<{ rule_id: string; result: RuleOutcome["result"] }>;
  violations: PolicyViolationOut[];
  /** Non-blocking approval/review requirements surfaced by the rules. */
  requirements: Array<{ rule_id: string; rule_type: string; reason: string }>;
  trajectory_context?: { events_considered: number };
  evaluated_at: string;
  /** Deterministic hash of (rules + context + outcomes) for auditability. */
  evaluation_hash: string;
}

export interface EvaluateInput {
  policyId: string;
  policyVersion: number;
  rules: CompiledRule[];
  context: EvaluationContext;
}

export class PolicyEngine {
  /**
   * Evaluate all enabled rules deterministically. Pure function of its inputs (the only
   * "randomness", violation_id/evaluation timestamp, is derived from context where it
   * matters; ids are cosmetic and excluded from the evaluation_hash).
   */
  evaluate(input: EvaluateInput): PolicyEvaluationOut {
    const enabled = input.rules
      .filter((r) => r.enabled !== false)
      .slice()
      .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100) || a.rule_id.localeCompare(b.rule_id));

    const outcomes: RuleOutcome[] = enabled.map((rule) => {
      const evaluator = EVALUATORS[rule.type];
      return evaluator(rule, input.context);
    });

    const violations: PolicyViolationOut[] = outcomes
      .filter((o) => o.result === "VIOLATION")
      .map((o) => ({
        violation_id: `violation_${randomUUID()}`,
        rule_id: o.rule_id,
        rule_type: o.rule_type,
        field: o.field,
        actual_value: o.actual_value,
        expected: o.expected,
        severity: o.severity ?? "HIGH",
        message: o.reason ?? "Policy rule violated.",
      }));

    const requirements = outcomes
      .filter((o) => o.result === "REQUIRE_APPROVAL" || o.result === "REVIEW")
      .map((o) => ({ rule_id: o.rule_id, rule_type: o.rule_type, reason: o.reason ?? "" }));

    const status: PolicyEvaluationStatus =
      violations.length > 0 ? "FAIL" : requirements.length > 0 ? "REVIEW" : "PASS";

    // Hash excludes cosmetic ids/timestamps so identical inputs hash identically
    // (determinism check leans on this).
    const evaluationHash = sha256Json({
      policyId: input.policyId,
      version: input.policyVersion,
      rules: enabled,
      context: input.context,
      outcomes: outcomes.map((o) => ({ rule_id: o.rule_id, result: o.result })),
    });

    return {
      schema_version: "policy_evaluation.v1",
      policy_id: input.policyId,
      policy_version: input.policyVersion,
      status,
      rules_checked: outcomes.map((o) => ({ rule_id: o.rule_id, result: o.result })),
      violations,
      requirements,
      trajectory_context: input.context.trajectoryEventTypes
        ? { events_considered: input.context.trajectoryEventTypes.length }
        : undefined,
      evaluated_at: input.context.now,
      evaluation_hash: evaluationHash,
    };
  }
}
