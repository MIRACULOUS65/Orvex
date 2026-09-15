/**
 * Shared contract primitives — Phase 2, Task 2.1.
 *
 * Building blocks reused across the SentinelPay contract schemas. The most important
 * primitive is `Money` / `moneyAmount`: authoritative monetary values are ALWAYS
 * decimal strings, never JavaScript floating-point numbers (CONTRACTS.md §4.3). Float
 * money is a correctness/security hazard (rounding drift, silent precision loss) and
 * is rejected structurally here so no downstream schema can reintroduce it.
 */
import { z } from "zod";

/**
 * A non-empty identifier string. Used for the many `*_id` fields in the contracts.
 */
export const idString = z.string().min(1);

/**
 * ISO-8601 timestamp string. The contracts transmit timestamps as strings
 * (e.g. "2026-09-11T12:00:00Z"), not epoch numbers, so they round-trip through JSON
 * without precision loss and remain human-auditable.
 */
export const isoTimestamp = z.string().min(1);

/**
 * A decimal monetary amount expressed as a STRING (CONTRACTS.md §4.3).
 *
 * Accepts an optional leading sign, digits, and an optional fractional part
 * (e.g. "0", "4.20", "100.00", "-1.5"). It deliberately does NOT accept:
 *   - JavaScript numbers (float money is forbidden)
 *   - exponent notation ("1e3")
 *   - empty strings
 *
 * This is intentionally a format/shape guard, not a full fixed-point validator;
 * currency-specific scale enforcement belongs to later deterministic components.
 */
export const moneyAmount = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/u, "monetary amount must be a decimal string, not a float");

/**
 * Money value object — a decimal-string `value` plus a `currency` code
 * (mirrors `Money` in Orvex/ML/schemas/action_proposal.py).
 */
export const Money = z
  .object({
    value: moneyAmount,
    currency: z.string().min(1),
  })
  .strict();
export type Money = z.infer<typeof Money>;

/**
 * A 0..1 confidence/score value. Several AI advisory sub-assessments carry these.
 */
export const unitInterval = z.number().min(0).max(1);
