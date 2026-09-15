/**
 * Decision contract — Phase 2, Task 2.1.
 *
 * Mirrors CONTRACTS.md §31/§32. This is the Core's FINAL authorization result before
 * execution — the deterministic authority object. `result` is always one of
 * ALLOW / REVIEW / DENY (§32). This is where authorization legitimately lives (unlike
 * the advisory SecurityAssessment), so a `result` field here is correct and expected.
 * Core-owned, `.strict()`.
 *
 * The embedded evidence objects (policy_evaluation / security_assessment /
 * transaction_analysis / simulation_result) are carried as open records at the
 * contract layer to keep the Decision aggregate decoupled; deterministic components in
 * later phases populate them with the concrete typed objects.
 */
import { z } from "zod";
import { idString, isoTimestamp } from "./primitives.js";

export const DecisionResult = z.enum(["ALLOW", "REVIEW", "DENY"]);
export type DecisionResult = z.infer<typeof DecisionResult>;

export const DecisionApprovalState = z
  .object({
    required: z.boolean(),
    status: z.string(),
  })
  .strict();
export type DecisionApprovalState = z.infer<typeof DecisionApprovalState>;

export const Decision = z
  .object({
    schema_version: z.literal("decision.v1").default("decision.v1"),
    decision_id: idString,
    proposal_id: idString,
    transaction_id: idString.nullish(),
    result: DecisionResult,
    reasons: z.array(z.string()).default([]),

    policy_evaluation: z.record(z.string(), z.unknown()).default({}),
    security_assessment: z.record(z.string(), z.unknown()).default({}),
    transaction_analysis: z.record(z.string(), z.unknown()).default({}),
    simulation_result: z.record(z.string(), z.unknown()).default({}),

    approval: DecisionApprovalState,
    decision_version: z.number().int(),
    created_at: isoTimestamp,
  })
  .strict();
export type Decision = z.infer<typeof Decision>;
