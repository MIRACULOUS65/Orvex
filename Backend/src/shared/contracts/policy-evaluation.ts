/**
 * PolicyEvaluation + PolicyViolation contracts — Phase 2, Task 2.1.
 *
 * Mirrors CONTRACTS.md §26/§27. The deterministic policy engine returns an explicit
 * machine-readable result. `PolicyViolation` is included because `PolicyEvaluation`
 * depends on it (approved deviation from the plan's Task 2.1 list). Core-owned and
 * deterministic, so `.strict()`.
 */
import { z } from "zod";
import { idString, isoTimestamp } from "./primitives.js";
import { RuleType } from "./policy.js";

export const PolicyEvaluationStatus = z.enum(["PASS", "FAIL", "REVIEW"]);
export type PolicyEvaluationStatus = z.infer<typeof PolicyEvaluationStatus>;

export const RuleResult = z.enum(["PASS", "FAIL", "REVIEW", "SKIPPED"]);
export type RuleResult = z.infer<typeof RuleResult>;

/** CONTRACTS.md §27 — the exact violation description when a policy fails. */
export const PolicyViolation = z
  .object({
    schema_version: z.literal("policy_violation.v1").default("policy_violation.v1"),
    violation_id: idString,
    rule_id: idString,
    rule_type: RuleType,
    trajectory_event_id: idString.nullish(),
    field: z.string(),
    actual_value: z.string(),
    expected: z.string(),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    message: z.string(),
  })
  .strict();
export type PolicyViolation = z.infer<typeof PolicyViolation>;

export const RuleCheck = z
  .object({
    rule_id: idString,
    result: RuleResult,
  })
  .strict();
export type RuleCheck = z.infer<typeof RuleCheck>;

export const TrajectoryContext = z
  .object({
    trace_id: idString,
    events_considered: z.number().int(),
  })
  .strict();
export type TrajectoryContext = z.infer<typeof TrajectoryContext>;

export const PolicyEvaluation = z
  .object({
    schema_version: z
      .literal("policy_evaluation.v1")
      .default("policy_evaluation.v1"),
    policy_id: idString,
    policy_version: z.number().int(),
    status: PolicyEvaluationStatus,
    rules_checked: z.array(RuleCheck).default([]),
    violations: z.array(PolicyViolation).default([]),
    trajectory_context: TrajectoryContext.nullish(),
    evaluated_at: isoTimestamp,
  })
  .strict();
export type PolicyEvaluation = z.infer<typeof PolicyEvaluation>;
