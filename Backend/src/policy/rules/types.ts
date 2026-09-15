/**
 * Compiled rule model + evaluation context — Phase 4, Task 4.3.
 *
 * These are the deterministic, Core-internal shapes the Policy Engine consumes. They
 * align with CONTRACTS.md §8 (PolicyRule) but are the compiled/normalized form the
 * engine evaluates. The engine NEVER calls an LLM or model inference; it operates
 * purely over this structured context (Requirement: policy engine determinism).
 *
 * All monetary values are decimal STRINGS in the config and are compared using exact
 * Decimal arithmetic (src/shared/money.ts) — never floats.
 */
import { CoreError } from "../../shared/errors/index.js";

export const RULE_TYPES = [
  "AMOUNT_LIMIT",
  "CUMULATIVE_LIMIT",
  "RECIPIENT_ALLOWLIST",
  "RECIPIENT_BLOCKLIST",
  "NEW_RECIPIENT_APPROVAL",
  "CATEGORY_ALLOW",
  "CATEGORY_BLOCK",
  "ASSET_ALLOW",
  "ASSET_BLOCK",
  "NETWORK_ALLOW",
  "NETWORK_BLOCK",
  "TIME_WINDOW",
  "HUMAN_APPROVAL",
  "REQUIRED_PREDECESSOR",
  "NO_STRUCTURING",
  "CAPABILITY_EXPIRY",
] as const;

export type RuleType = (typeof RULE_TYPES)[number];

/** Cumulative window dimensions (plan §4.5). */
export type CumulativeWindow = "daily" | "weekly" | "monthly" | "recipient" | "category" | "asset";

/** A single compiled rule. `config` is rule-type-specific (validated per evaluator). */
export interface CompiledRule {
  rule_id: string;
  type: RuleType;
  priority?: number;
  enabled?: boolean;
  config: Record<string, unknown>;
}

/**
 * The deterministic evaluation context. This is assembled by Core from authoritative
 * state (proposal, financial state, trajectory, capability) — never from model output.
 */
export interface EvaluationContext {
  /** The action under evaluation. */
  transaction: {
    action: string;
    amount?: string; // decimal string
    currency?: string;
    asset?: string;
    network?: string;
    category?: string;
    recipient?: string; // normalized recipient identifier/address
  };
  /** Cumulative spend already committed+reserved, keyed by window dimension. */
  cumulativeSpent?: Partial<Record<CumulativeWindow, string>>; // decimal strings
  /** Per-key cumulative spend (e.g. recipient/category/asset totals). */
  cumulativeByKey?: Partial<Record<CumulativeWindow, Record<string, string>>>;
  /** Recipients this agent has previously transacted with (for NEW_RECIPIENT_APPROVAL). */
  knownRecipients?: string[];
  /** Ordered trajectory event types observed (for REQUIRED_PREDECESSOR). */
  trajectoryEventTypes?: string[];
  /** Recent transaction amounts+timestamps for NO_STRUCTURING detection. */
  recentTransactions?: Array<{ amount: string; at: string }>; // decimal + ISO
  /** Capability expiry, if a capability gates this action. */
  capabilityExpiresAt?: string | null; // ISO
  /** Evaluation clock (UTC). Injected for deterministic time-window/expiry tests. */
  now: string; // ISO
}

/** Per-rule outcome. REVIEW/REQUIRE_APPROVAL do not block; VIOLATION is a hard fail. */
export type RuleResult = "PASS" | "VIOLATION" | "REVIEW" | "REQUIRE_APPROVAL" | "SKIPPED";

export interface RuleOutcome {
  rule_id: string;
  rule_type: RuleType;
  result: RuleResult;
  /** Present when result is VIOLATION/REVIEW/REQUIRE_APPROVAL. */
  reason?: string;
  field?: string;
  actual_value?: string;
  expected?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

/** Structural validation of a compiled rule set. Throws POLICY_INVALID on bad input. */
export function validateCompiledRules(rules: CompiledRule[]): void {
  if (!Array.isArray(rules)) {
    throw CoreError.of("POLICY_INVALID", "Compiled rules must be an array.");
  }
  const seen = new Set<string>();
  for (const rule of rules) {
    if (!rule || typeof rule !== "object") {
      throw CoreError.of("POLICY_INVALID", "Each rule must be an object.");
    }
    if (!rule.rule_id) {
      throw CoreError.of("POLICY_INVALID", "Each rule requires a rule_id.");
    }
    if (seen.has(rule.rule_id)) {
      throw CoreError.of("POLICY_CONFLICT", `Duplicate rule_id '${rule.rule_id}'.`);
    }
    seen.add(rule.rule_id);
    if (!(RULE_TYPES as readonly string[]).includes(rule.type)) {
      throw CoreError.of("POLICY_INVALID", `Unknown rule type '${rule.type}'.`, {
        details: { ruleId: rule.rule_id, type: rule.type },
      });
    }
  }
}
