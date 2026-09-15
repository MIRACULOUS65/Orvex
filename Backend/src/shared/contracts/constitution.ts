/**
 * AgentConstitution contract — Phase 2, Task 2.1.
 *
 * Mirrors CONTRACTS.md §7. The Constitution describes what the company has authorized
 * a particular agent to do IN GENERAL (broader than a single task Intent). This is a
 * Core-owned object, so it is `.strict()`: the Backend must emit exactly the declared
 * fields. Spending limits are decimal STRINGS (CONTRACTS.md §4.3).
 */
import { z } from "zod";
import { idString, isoTimestamp, moneyAmount } from "./primitives.js";

export const ConstitutionStatus = z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]);
export type ConstitutionStatus = z.infer<typeof ConstitutionStatus>;

/**
 * Spending limits map — each value is a decimal-string amount. CONTRACTS.md §7 shows
 * `single_transaction` and `daily`; kept as an open string->moneyAmount record so
 * additional named limits (e.g. weekly/monthly) are representable without a schema
 * change, while still forbidding float values.
 */
export const SpendingLimits = z.record(z.string(), moneyAmount);
export type SpendingLimits = z.infer<typeof SpendingLimits>;

export const AgentConstitution = z
  .object({
    schema_version: z.literal("constitution.v1").default("constitution.v1"),
    constitution_id: idString,
    company_id: idString,
    agent_id: idString,

    purpose: z.string(),

    allowed_actions: z.array(z.string()).default([]),
    blocked_actions: z.array(z.string()).default([]),
    allowed_assets: z.array(z.string()).default([]),
    allowed_networks: z.array(z.string()).default([]),
    allowed_categories: z.array(z.string()).default([]),
    blocked_categories: z.array(z.string()).default([]),

    spending_limits: SpendingLimits.default({}),

    approval_rules: z.array(z.record(z.string(), z.unknown())).default([]),
    recipient_rules: z.record(z.string(), z.unknown()).default({}),
    time_rules: z.record(z.string(), z.unknown()).default({}),

    version: z.number().int(),
    status: ConstitutionStatus,
    created_at: isoTimestamp,
  })
  .strict();
export type AgentConstitution = z.infer<typeof AgentConstitution>;
