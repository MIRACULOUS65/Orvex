/**
 * Intent contract — Phase 2, Task 2.1.
 *
 * Mirrors CONTRACTS.md §6 and Orvex/ML/schemas/intent.py field-for-field. The Intent
 * is the structured representation of the user's goal. It is NOT a payment
 * authorization. Budget/limit amounts are decimal STRINGS, never floats
 * (CONTRACTS.md §4.3).
 *
 * This is a CONSUMER-side contract: the Backend receives Intents produced by the AI
 * layer, so the object schema is `.passthrough()` to tolerate unknown/forward-compat
 * fields (Task 2.4) while still enforcing every required field.
 */
import { z } from "zod";
import { idString, isoTimestamp, moneyAmount, unitInterval } from "./primitives.js";

export const AutonomyLevel = z.enum(["MANUAL", "CONDITIONAL", "AUTOMATIC"]);
export type AutonomyLevel = z.infer<typeof AutonomyLevel>;

export const IntentStatus = z.enum([
  "VALID",
  "NEEDS_CLARIFICATION",
  "EXPIRED",
  "INVALID",
]);
export type IntentStatus = z.infer<typeof IntentStatus>;

export const BudgetPeriod = z.enum(["daily", "weekly", "monthly", "once"]);
export type BudgetPeriod = z.infer<typeof BudgetPeriod>;

/** Budget constraint. `maximum` is a decimal STRING — never a float. */
export const MoneyLimit = z
  .object({
    maximum: moneyAmount,
    currency: z.string().min(1),
    period: BudgetPeriod.nullish(),
  })
  .passthrough();
export type MoneyLimit = z.infer<typeof MoneyLimit>;

/** A field the system could not determine and refuses to invent. */
export const Ambiguity = z
  .object({
    field: z.string(),
    reason: z.string(),
  })
  .passthrough();
export type Ambiguity = z.infer<typeof Ambiguity>;

export const Intent = z
  .object({
    schema_version: z.literal("intent.v1").default("intent.v1"),
    intent_id: idString,
    user_id: idString.nullish(),
    agent_id: idString,

    user_goal: z.string(),
    purpose: z.string(),
    desired_outcome: z.string(),

    constraints: z.array(z.string()).default([]),
    budget: MoneyLimit.nullish(),

    authorized_actions: z.array(z.string()).default([]),
    forbidden_actions: z.array(z.string()).default([]),

    autonomy_level: AutonomyLevel.default("MANUAL"),
    approval_conditions: z.array(z.string()).default([]),

    valid_from: isoTimestamp,
    valid_until: isoTimestamp,

    status: IntentStatus.default("VALID"),
    confidence: unitInterval.nullish(),
    ambiguities: z.array(Ambiguity).default([]),

    created_at: isoTimestamp,
  })
  .passthrough();
export type Intent = z.infer<typeof Intent>;
