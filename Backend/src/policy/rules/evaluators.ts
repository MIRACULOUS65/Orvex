/**
 * Deterministic rule evaluators — Phase 4, Tasks 4.4-4.12.
 *
 * Each evaluator is a PURE function of (rule, context) with no side effects, no I/O, no
 * model inference. Money is compared with exact Decimal arithmetic. Times are compared
 * in UTC. This purity is what makes policy evaluation deterministic and property-testable.
 *
 * Result semantics:
 *   PASS            — rule satisfied
 *   VIOLATION       — hard failure; the decision cannot be ALLOW
 *   REQUIRE_APPROVAL— not a rejection; a human approval is required (HUMAN_APPROVAL,
 *                     NEW_RECIPIENT_APPROVAL)
 *   REVIEW          — flag for human review without hard-blocking
 *   SKIPPED         — rule not applicable to this transaction
 */
import { gt, lte, toDecimal } from "../../shared/money.js";
import type { CompiledRule, EvaluationContext, RuleOutcome } from "./types.js";

type Evaluator = (rule: CompiledRule, ctx: EvaluationContext) => RuleOutcome;

function outcome(rule: CompiledRule, partial: Omit<RuleOutcome, "rule_id" | "rule_type">): RuleOutcome {
  return { rule_id: rule.rule_id, rule_type: rule.type, ...partial };
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

// ---- §4.4 AMOUNT_LIMIT -------------------------------------------------- //
// amount == limit -> PASS, amount < limit -> PASS, amount > limit -> VIOLATION.
const amountLimit: Evaluator = (rule, ctx) => {
  const max = rule.config.maximum as string | undefined;
  if (max === undefined) return outcome(rule, { result: "SKIPPED" });
  if (ctx.transaction.amount === undefined) {
    return outcome(rule, { result: "VIOLATION", reason: "No amount to check against limit.", severity: "HIGH" });
  }
  const amount = toDecimal(ctx.transaction.amount);
  const limit = toDecimal(max);
  if (lte(amount, limit)) return outcome(rule, { result: "PASS" });
  return outcome(rule, {
    result: "VIOLATION",
    reason: "Amount exceeds the configured limit.",
    field: "transaction.amount",
    actual_value: ctx.transaction.amount,
    expected: `<= ${max}`,
    severity: "HIGH",
  });
};

// ---- §4.5 CUMULATIVE_LIMIT --------------------------------------------- //
const cumulativeLimit: Evaluator = (rule, ctx) => {
  const window = rule.config.window as string | undefined;
  const max = rule.config.maximum as string | undefined;
  if (!window || max === undefined) return outcome(rule, { result: "SKIPPED" });
  const amount = ctx.transaction.amount ? toDecimal(ctx.transaction.amount) : toDecimal("0");

  // Determine the already-spent total for this window (scalar or per-key).
  let spent = toDecimal("0");
  if (window === "recipient" || window === "category" || window === "asset") {
    const key =
      window === "recipient"
        ? ctx.transaction.recipient
        : window === "category"
          ? ctx.transaction.category
          : ctx.transaction.asset;
    const byKey = ctx.cumulativeByKey?.[window] ?? {};
    spent = toDecimal((key && byKey[key]) || "0");
  } else {
    spent = toDecimal(ctx.cumulativeSpent?.[window as "daily" | "weekly" | "monthly"] ?? "0");
  }

  const projected = spent.plus(amount);
  const limit = toDecimal(max);
  if (lte(projected, limit)) return outcome(rule, { result: "PASS" });
  return outcome(rule, {
    result: "VIOLATION",
    reason: `Cumulative ${window} spend would exceed the limit.`,
    field: `cumulative.${window}`,
    actual_value: projected.toString(),
    expected: `<= ${max}`,
    severity: "HIGH",
  });
};

// ---- §4.6 RECIPIENT_ALLOWLIST ------------------------------------------ //
const recipientAllowlist: Evaluator = (rule, ctx) => {
  const allow = asStringArray(rule.config.recipients);
  const recipient = ctx.transaction.recipient;
  if (!recipient) {
    return outcome(rule, { result: "VIOLATION", reason: "No recipient to match allowlist.", severity: "HIGH" });
  }
  if (allow.includes(recipient)) return outcome(rule, { result: "PASS" });
  return outcome(rule, {
    result: "VIOLATION",
    reason: "Recipient is not in the allowlist.",
    field: "transaction.recipient",
    actual_value: recipient,
    expected: "recipient must be allowlisted",
    severity: "CRITICAL",
  });
};

// ---- §4.6 RECIPIENT_BLOCKLIST ------------------------------------------ //
const recipientBlocklist: Evaluator = (rule, ctx) => {
  const block = asStringArray(rule.config.recipients);
  const recipient = ctx.transaction.recipient;
  if (!recipient) return outcome(rule, { result: "PASS" });
  if (!block.includes(recipient)) return outcome(rule, { result: "PASS" });
  return outcome(rule, {
    result: "VIOLATION",
    reason: "Recipient is blocklisted.",
    field: "transaction.recipient",
    actual_value: recipient,
    expected: "recipient must not be blocklisted",
    severity: "CRITICAL",
  });
};

// ---- §4.6 NEW_RECIPIENT_APPROVAL --------------------------------------- //
const newRecipientApproval: Evaluator = (rule, ctx) => {
  const recipient = ctx.transaction.recipient;
  if (!recipient) return outcome(rule, { result: "SKIPPED" });
  const known = ctx.knownRecipients ?? [];
  if (known.includes(recipient)) return outcome(rule, { result: "PASS" });
  return outcome(rule, {
    result: "REQUIRE_APPROVAL",
    reason: "New recipient requires human approval.",
    field: "transaction.recipient",
    actual_value: recipient,
    severity: "MEDIUM",
  });
};

// ---- §4.7 ASSET_ALLOW / ASSET_BLOCK ------------------------------------ //
const assetAllow: Evaluator = (rule, ctx) => {
  const allow = asStringArray(rule.config.assets);
  const asset = ctx.transaction.asset;
  if (!asset) return outcome(rule, { result: "VIOLATION", reason: "No asset specified.", severity: "HIGH" });
  if (allow.includes(asset)) return outcome(rule, { result: "PASS" });
  return outcome(rule, {
    result: "VIOLATION",
    reason: "Asset is not allowed.",
    field: "transaction.asset",
    actual_value: asset,
    expected: `one of ${allow.join(",")}`,
    severity: "HIGH",
  });
};

const assetBlock: Evaluator = (rule, ctx) => {
  const block = asStringArray(rule.config.assets);
  const asset = ctx.transaction.asset;
  if (!asset || !block.includes(asset)) return outcome(rule, { result: "PASS" });
  return outcome(rule, {
    result: "VIOLATION",
    reason: "Asset is blocked.",
    field: "transaction.asset",
    actual_value: asset,
    severity: "HIGH",
  });
};

// ---- §4.7 NETWORK_ALLOW / NETWORK_BLOCK -------------------------------- //
const networkAllow: Evaluator = (rule, ctx) => {
  const allow = asStringArray(rule.config.networks);
  const network = ctx.transaction.network;
  if (!network) return outcome(rule, { result: "VIOLATION", reason: "No network specified.", severity: "HIGH" });
  if (allow.includes(network)) return outcome(rule, { result: "PASS" });
  return outcome(rule, {
    result: "VIOLATION",
    reason: "Network is not allowed.",
    field: "transaction.network",
    actual_value: network,
    expected: `one of ${allow.join(",")}`,
    severity: "CRITICAL",
  });
};

const networkBlock: Evaluator = (rule, ctx) => {
  const block = asStringArray(rule.config.networks);
  const network = ctx.transaction.network;
  if (!network || !block.includes(network)) return outcome(rule, { result: "PASS" });
  return outcome(rule, {
    result: "VIOLATION",
    reason: "Network is blocked.",
    field: "transaction.network",
    actual_value: network,
    severity: "CRITICAL",
  });
};

// ---- §4.6 CATEGORY_ALLOW / CATEGORY_BLOCK ------------------------------ //
const categoryAllow: Evaluator = (rule, ctx) => {
  const allow = asStringArray(rule.config.categories);
  const category = ctx.transaction.category;
  if (!category) return outcome(rule, { result: "VIOLATION", reason: "No category specified.", severity: "MEDIUM" });
  if (allow.includes(category)) return outcome(rule, { result: "PASS" });
  return outcome(rule, {
    result: "VIOLATION",
    reason: "Category is not allowed.",
    field: "transaction.category",
    actual_value: category,
    severity: "MEDIUM",
  });
};

const categoryBlock: Evaluator = (rule, ctx) => {
  const block = asStringArray(rule.config.categories);
  const category = ctx.transaction.category;
  if (!category || !block.includes(category)) return outcome(rule, { result: "PASS" });
  return outcome(rule, {
    result: "VIOLATION",
    reason: "Category is blocked.",
    field: "transaction.category",
    actual_value: category,
    severity: "MEDIUM",
  });
};

// ---- §4.8 TIME_WINDOW (UTC) -------------------------------------------- //
// config: { start_hour, end_hour } in UTC hours [0..23]. Window may wrap midnight.
const timeWindow: Evaluator = (rule, ctx) => {
  const start = rule.config.start_hour as number | undefined;
  const end = rule.config.end_hour as number | undefined;
  if (start === undefined || end === undefined) return outcome(rule, { result: "SKIPPED" });
  const hour = new Date(ctx.now).getUTCHours();
  const inWindow = start <= end ? hour >= start && hour < end : hour >= start || hour < end;
  if (inWindow) return outcome(rule, { result: "PASS" });
  return outcome(rule, {
    result: "VIOLATION",
    reason: "Outside the permitted UTC time window.",
    field: "time.utc_hour",
    actual_value: String(hour),
    expected: `[${start},${end})`,
    severity: "MEDIUM",
  });
};

// ---- §4.9 HUMAN_APPROVAL ----------------------------------------------- //
// A requirement, not an immediate rejection.
const humanApproval: Evaluator = (rule) =>
  outcome(rule, {
    result: "REQUIRE_APPROVAL",
    reason: "Policy requires human approval for this action.",
    severity: "MEDIUM",
  });

// ---- §4.10 REQUIRED_PREDECESSOR (trajectory-aware) --------------------- //
// config: { predecessor: "invoice_verified" } — must appear in trajectory before now.
const requiredPredecessor: Evaluator = (rule, ctx) => {
  const predecessor = rule.config.predecessor as string | undefined;
  if (!predecessor) return outcome(rule, { result: "SKIPPED" });
  const events = ctx.trajectoryEventTypes ?? [];
  if (events.includes(predecessor)) return outcome(rule, { result: "PASS" });
  return outcome(rule, {
    result: "VIOLATION",
    reason: `Required predecessor '${predecessor}' did not occur before this action.`,
    field: "trajectory.predecessor",
    expected: predecessor,
    severity: "HIGH",
  });
};

// ---- §4.11 NO_STRUCTURING ---------------------------------------------- //
// Detect splitting a payment into many sub-threshold transactions within a window.
// config: { threshold, window_minutes, max_count } — if the count of recent txns
// (including this one) within window_minutes is > max_count AND each is below threshold,
// flag structuring.
const noStructuring: Evaluator = (rule, ctx) => {
  const threshold = rule.config.threshold as string | undefined;
  const windowMinutes = (rule.config.window_minutes as number | undefined) ?? 60;
  const maxCount = (rule.config.max_count as number | undefined) ?? 3;
  if (threshold === undefined) return outcome(rule, { result: "SKIPPED" });

  const now = new Date(ctx.now).getTime();
  const windowMs = windowMinutes * 60_000;
  const thresholdDec = toDecimal(threshold);

  const recent = (ctx.recentTransactions ?? []).filter(
    (t) => now - new Date(t.at).getTime() <= windowMs,
  );
  // Include the current transaction.
  const all = [...recent];
  if (ctx.transaction.amount !== undefined) {
    all.push({ amount: ctx.transaction.amount, at: ctx.now });
  }
  // Sub-threshold = amount at or below the structuring threshold. Structuring is
  // suspected when more than max_count such transactions occur within the window.
  const subThresholdCount = all.filter((t) => !gt(toDecimal(t.amount), thresholdDec)).length;
  if (subThresholdCount > maxCount) {
    return outcome(rule, {
      result: "VIOLATION",
      reason: "Potential structuring: too many sub-threshold transactions in window.",
      field: "structuring.count",
      actual_value: String(subThresholdCount),
      expected: `<= ${maxCount}`,
      severity: "HIGH",
    });
  }
  return outcome(rule, { result: "PASS" });
};

// ---- §4.12 CAPABILITY_EXPIRY ------------------------------------------- //
// Policy fails if the gating capability is expired at `now`.
const capabilityExpiry: Evaluator = (rule, ctx) => {
  const expiresAt = ctx.capabilityExpiresAt;
  if (!expiresAt) return outcome(rule, { result: "SKIPPED" });
  const now = new Date(ctx.now).getTime();
  if (new Date(expiresAt).getTime() > now) return outcome(rule, { result: "PASS" });
  return outcome(rule, {
    result: "VIOLATION",
    reason: "Required capability has expired.",
    field: "capability.expires_at",
    actual_value: expiresAt,
    expected: `> ${ctx.now}`,
    severity: "CRITICAL",
  });
};

/** Registry mapping each rule type to its deterministic evaluator. */
export const EVALUATORS: Record<CompiledRule["type"], Evaluator> = {
  AMOUNT_LIMIT: amountLimit,
  CUMULATIVE_LIMIT: cumulativeLimit,
  RECIPIENT_ALLOWLIST: recipientAllowlist,
  RECIPIENT_BLOCKLIST: recipientBlocklist,
  NEW_RECIPIENT_APPROVAL: newRecipientApproval,
  ASSET_ALLOW: assetAllow,
  ASSET_BLOCK: assetBlock,
  NETWORK_ALLOW: networkAllow,
  NETWORK_BLOCK: networkBlock,
  CATEGORY_ALLOW: categoryAllow,
  CATEGORY_BLOCK: categoryBlock,
  TIME_WINDOW: timeWindow,
  HUMAN_APPROVAL: humanApproval,
  REQUIRED_PREDECESSOR: requiredPredecessor,
  NO_STRUCTURING: noStructuring,
  CAPABILITY_EXPIRY: capabilityExpiry,
};
