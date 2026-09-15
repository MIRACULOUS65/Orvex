/**
 * Policy contracts — Phase 2, Task 2.1.
 *
 * Mirrors CONTRACTS.md §8 (Policy / rule shape) and the rule vocabulary shared with
 * Orvex/ML/schemas/policy_candidate.py. `Policy` is the executable representation of a
 * Constitution/rulebook after deterministic compilation. The AI layer may produce a
 * CANDIDATE, but only Core's deterministic policy system owns final enforcement; these
 * Core-owned objects are therefore `.strict()`.
 *
 * Constraint values that represent money are decimal STRINGS (CONTRACTS.md §4.3); the
 * `value` field accepts a string or list of strings to support both scalar and set
 * constraints (e.g. AMOUNT_LIMIT vs RECIPIENT_ALLOWLIST).
 */
import { z } from "zod";
import { idString, isoTimestamp } from "./primitives.js";

export const RuleType = z.enum([
  "AMOUNT_LIMIT",
  "CUMULATIVE_LIMIT",
  "RECIPIENT_ALLOWLIST",
  "RECIPIENT_BLOCKLIST",
  "CATEGORY_ALLOW",
  "CATEGORY_BLOCK",
  "ASSET_ALLOW",
  "NETWORK_ALLOW",
  "TIME_WINDOW",
  "NEW_RECIPIENT_APPROVAL",
  "REQUIRED_PREDECESSOR",
  "HUMAN_APPROVAL",
  "NO_STRUCTURING",
  "CAPABILITY_EXPIRY",
]);
export type RuleType = z.infer<typeof RuleType>;

export const RequiredAction = z.enum([
  "ALLOW",
  "REVIEW",
  "DENY",
  "REQUIRE_APPROVAL",
]);
export type RequiredAction = z.infer<typeof RequiredAction>;

export const RuleConstraint = z
  .object({
    operator: z.string().nullish(), // e.g. LTE, GTE, IN, NOT_IN
    field: z.string().nullish(),
    value: z.union([z.string(), z.array(z.string())]).nullish(),
    currency: z.string().nullish(),
  })
  .strict();
export type RuleConstraint = z.infer<typeof RuleConstraint>;

export const PolicyRule = z
  .object({
    rule_id: idString,
    type: RuleType,
    condition: z.record(z.string(), z.unknown()).default({}),
    constraint: RuleConstraint.default({}),
    required_action: RequiredAction.default("ALLOW"),
    priority: z.number().int().default(100),
    enabled: z.boolean().default(true),
  })
  .strict();
export type PolicyRule = z.infer<typeof PolicyRule>;

export const PolicyStatus = z.enum(["DRAFT", "ACTIVE", "SUPERSEDED", "DISABLED"]);
export type PolicyStatus = z.infer<typeof PolicyStatus>;

/**
 * The compiled, executable Policy owned by Core. CONTRACTS.md §8 defines the canonical
 * rule shape; the enclosing Policy aggregate (id/version/status/rules) is the Core
 * representation used by the deterministic engine in later phases.
 */
export const Policy = z
  .object({
    schema_version: z.literal("policy.v1").default("policy.v1"),
    policy_id: idString,
    company_id: idString,
    agent_id: idString.nullish(),
    version: z.number().int(),
    status: PolicyStatus,
    rules: z.array(PolicyRule).default([]),
    created_at: isoTimestamp,
  })
  .strict();
export type Policy = z.infer<typeof Policy>;
