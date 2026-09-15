/**
 * Phase 4 — deterministic Policy Engine + rule tests (Tasks 4.4-4.14).
 *
 * Pure/in-memory: the engine takes structured context and emits a PolicyEvaluation with
 * no I/O and no model inference. Covers every V1 rule, boundary cases, determinism, and
 * the hard property invariants (amount > max cannot ALLOW, blocked recipient cannot
 * ALLOW, wrong network cannot ALLOW, expired capability cannot authorize).
 */
import { describe, expect, it } from "vitest";
import { PolicyEngine, type CompiledRule, type EvaluationContext } from "@/policy/index";

const engine = new PolicyEngine();
const NOW = "2026-09-11T12:00:00Z";

function ctx(tx: Partial<EvaluationContext["transaction"]>, extra: Partial<EvaluationContext> = {}): EvaluationContext {
  return { transaction: { action: "PAY", ...tx }, now: NOW, ...extra };
}

function run(rules: CompiledRule[], context: EvaluationContext) {
  return engine.evaluate({ policyId: "policy_1", policyVersion: 1, rules, context });
}

describe("Phase 4 — AMOUNT_LIMIT boundaries", () => {
  const rule: CompiledRule = { rule_id: "r_amt", type: "AMOUNT_LIMIT", config: { maximum: "20.00" } };

  it("amount < limit -> PASS", () => {
    expect(run([rule], ctx({ amount: "19.99" })).status).toBe("PASS");
  });
  it("amount == limit -> PASS (boundary)", () => {
    expect(run([rule], ctx({ amount: "20.00" })).status).toBe("PASS");
  });
  it("amount > limit -> FAIL", () => {
    const out = run([rule], ctx({ amount: "20.01" }));
    expect(out.status).toBe("FAIL");
    expect(out.violations[0]?.rule_id).toBe("r_amt");
  });
  it("handles high-precision decimals without float drift", () => {
    const r: CompiledRule = { rule_id: "r", type: "AMOUNT_LIMIT", config: { maximum: "0.1" } };
    // 0.1 + 0.2 float trap: 0.3 must still be > 0.1 exactly.
    expect(run([r], ctx({ amount: "0.30" })).status).toBe("FAIL");
    expect(run([r], ctx({ amount: "0.10" })).status).toBe("PASS");
  });
});

describe("Phase 4 — CUMULATIVE_LIMIT (daily + per-recipient)", () => {
  it("projected daily spend within limit -> PASS", () => {
    const r: CompiledRule = { rule_id: "c", type: "CUMULATIVE_LIMIT", config: { window: "daily", maximum: "100.00" } };
    expect(run([r], ctx({ amount: "30.00" }, { cumulativeSpent: { daily: "70.00" } })).status).toBe("PASS");
  });
  it("projected daily spend over limit -> FAIL", () => {
    const r: CompiledRule = { rule_id: "c", type: "CUMULATIVE_LIMIT", config: { window: "daily", maximum: "100.00" } };
    expect(run([r], ctx({ amount: "30.01" }, { cumulativeSpent: { daily: "70.00" } })).status).toBe("FAIL");
  });
  it("per-recipient cumulative window uses the recipient key", () => {
    const r: CompiledRule = { rule_id: "c", type: "CUMULATIVE_LIMIT", config: { window: "recipient", maximum: "50.00" } };
    const context = ctx({ amount: "20.00", recipient: "0xabc" }, { cumulativeByKey: { recipient: { "0xabc": "40.00" } } });
    expect(run([r], context).status).toBe("FAIL");
  });
});

describe("Phase 4 — recipient rules", () => {
  it("RECIPIENT_ALLOWLIST: allowlisted -> PASS, other -> FAIL", () => {
    const r: CompiledRule = { rule_id: "al", type: "RECIPIENT_ALLOWLIST", config: { recipients: ["0xgood"] } };
    expect(run([r], ctx({ recipient: "0xgood" })).status).toBe("PASS");
    expect(run([r], ctx({ recipient: "0xevil" })).status).toBe("FAIL");
  });
  it("RECIPIENT_BLOCKLIST: blocked -> FAIL", () => {
    const r: CompiledRule = { rule_id: "bl", type: "RECIPIENT_BLOCKLIST", config: { recipients: ["0xbad"] } };
    expect(run([r], ctx({ recipient: "0xbad" })).status).toBe("FAIL");
    expect(run([r], ctx({ recipient: "0xok" })).status).toBe("PASS");
  });
  it("NEW_RECIPIENT_APPROVAL: unknown recipient -> REVIEW (require approval), known -> PASS", () => {
    const r: CompiledRule = { rule_id: "nr", type: "NEW_RECIPIENT_APPROVAL", config: {} };
    const newRec = run([r], ctx({ recipient: "0xnew" }, { knownRecipients: ["0xold"] }));
    expect(newRec.status).toBe("REVIEW");
    expect(newRec.requirements[0]?.rule_type).toBe("NEW_RECIPIENT_APPROVAL");
    expect(run([r], ctx({ recipient: "0xold" }, { knownRecipients: ["0xold"] })).status).toBe("PASS");
  });
});

describe("Phase 4 — asset / network / category rules", () => {
  it("ASSET_ALLOW / ASSET_BLOCK", () => {
    expect(run([{ rule_id: "a", type: "ASSET_ALLOW", config: { assets: ["USDC"] } }], ctx({ asset: "USDC" })).status).toBe("PASS");
    expect(run([{ rule_id: "a", type: "ASSET_ALLOW", config: { assets: ["USDC"] } }], ctx({ asset: "DAI" })).status).toBe("FAIL");
    expect(run([{ rule_id: "b", type: "ASSET_BLOCK", config: { assets: ["DAI"] } }], ctx({ asset: "DAI" })).status).toBe("FAIL");
  });
  it("NETWORK_ALLOW / NETWORK_BLOCK", () => {
    expect(run([{ rule_id: "n", type: "NETWORK_ALLOW", config: { networks: ["base-sepolia"] } }], ctx({ network: "base-sepolia" })).status).toBe("PASS");
    expect(run([{ rule_id: "n", type: "NETWORK_ALLOW", config: { networks: ["base-sepolia"] } }], ctx({ network: "ethereum" })).status).toBe("FAIL");
    expect(run([{ rule_id: "nb", type: "NETWORK_BLOCK", config: { networks: ["ethereum"] } }], ctx({ network: "ethereum" })).status).toBe("FAIL");
  });
  it("CATEGORY_ALLOW / CATEGORY_BLOCK", () => {
    expect(run([{ rule_id: "c", type: "CATEGORY_ALLOW", config: { categories: ["API"] } }], ctx({ category: "API" })).status).toBe("PASS");
    expect(run([{ rule_id: "c", type: "CATEGORY_ALLOW", config: { categories: ["API"] } }], ctx({ category: "GAMBLING" })).status).toBe("FAIL");
    expect(run([{ rule_id: "cb", type: "CATEGORY_BLOCK", config: { categories: ["GAMBLING"] } }], ctx({ category: "GAMBLING" })).status).toBe("FAIL");
  });
});

describe("Phase 4 — TIME_WINDOW (UTC)", () => {
  const r: CompiledRule = { rule_id: "t", type: "TIME_WINDOW", config: { start_hour: 9, end_hour: 17 } };
  it("inside window -> PASS", () => {
    expect(run([r], ctx({}, {})).status).toBe("PASS"); // NOW is 12:00 UTC
  });
  it("outside window -> FAIL", () => {
    expect(run([r], { transaction: { action: "PAY" }, now: "2026-09-11T20:00:00Z" }).status).toBe("FAIL");
  });
  it("window wrapping midnight is handled", () => {
    const night: CompiledRule = { rule_id: "t2", type: "TIME_WINDOW", config: { start_hour: 22, end_hour: 6 } };
    expect(run([night], { transaction: { action: "PAY" }, now: "2026-09-11T23:00:00Z" }).status).toBe("PASS");
    expect(run([night], { transaction: { action: "PAY" }, now: "2026-09-11T12:00:00Z" }).status).toBe("FAIL");
  });
});

describe("Phase 4 — HUMAN_APPROVAL is a requirement, not a rejection", () => {
  it("yields REVIEW, not FAIL", () => {
    const out = run([{ rule_id: "h", type: "HUMAN_APPROVAL", config: {} }], ctx({ amount: "5.00" }));
    expect(out.status).toBe("REVIEW");
    expect(out.violations).toHaveLength(0);
  });
});

describe("Phase 4 — REQUIRED_PREDECESSOR (trajectory-aware)", () => {
  const r: CompiledRule = { rule_id: "p", type: "REQUIRED_PREDECESSOR", config: { predecessor: "invoice_verified" } };
  it("predecessor present -> PASS", () => {
    expect(run([r], ctx({}, { trajectoryEventTypes: ["invoice_verified", "PROPOSAL_CREATED"] })).status).toBe("PASS");
  });
  it("predecessor absent -> FAIL", () => {
    expect(run([r], ctx({}, { trajectoryEventTypes: ["PROPOSAL_CREATED"] })).status).toBe("FAIL");
  });
});

describe("Phase 4 — NO_STRUCTURING", () => {
  const r: CompiledRule = {
    rule_id: "ns",
    type: "NO_STRUCTURING",
    config: { threshold: "10.00", window_minutes: 60, max_count: 3 },
  };
  it("too many sub-threshold txns in window -> FAIL", () => {
    const recent = [
      { amount: "9.00", at: "2026-09-11T11:30:00Z" },
      { amount: "9.00", at: "2026-09-11T11:40:00Z" },
      { amount: "9.00", at: "2026-09-11T11:50:00Z" },
    ];
    // current makes it 4 sub-threshold in the last hour > max_count 3.
    expect(run([r], ctx({ amount: "9.00" }, { recentTransactions: recent })).status).toBe("FAIL");
  });
  it("few sub-threshold txns -> PASS", () => {
    expect(run([r], ctx({ amount: "9.00" }, { recentTransactions: [{ amount: "9.00", at: "2026-09-11T11:50:00Z" }] })).status).toBe("PASS");
  });
});

describe("Phase 4 — CAPABILITY_EXPIRY", () => {
  const r: CompiledRule = { rule_id: "ce", type: "CAPABILITY_EXPIRY", config: {} };
  it("capability not expired -> PASS", () => {
    expect(run([r], ctx({}, { capabilityExpiresAt: "2026-09-11T13:00:00Z" })).status).toBe("PASS");
  });
  it("expired capability -> FAIL (cannot authorize)", () => {
    expect(run([r], ctx({}, { capabilityExpiresAt: "2026-09-11T11:00:00Z" })).status).toBe("FAIL");
  });
});

describe("Phase 4 — determinism", () => {
  it("same inputs produce identical evaluation_hash and status across runs", () => {
    const rules: CompiledRule[] = [
      { rule_id: "amt", type: "AMOUNT_LIMIT", config: { maximum: "20.00" } },
      { rule_id: "net", type: "NETWORK_ALLOW", config: { networks: ["base-sepolia"] } },
    ];
    const context = ctx({ amount: "10.00", network: "base-sepolia" });
    const a = run(rules, context);
    const b = run(rules, context);
    expect(a.evaluation_hash).toBe(b.evaluation_hash);
    expect(a.status).toBe(b.status);
  });
  it("rule ordering does not change the outcome (priority-sorted)", () => {
    const r1: CompiledRule = { rule_id: "amt", type: "AMOUNT_LIMIT", priority: 200, config: { maximum: "20.00" } };
    const r2: CompiledRule = { rule_id: "net", type: "NETWORK_ALLOW", priority: 100, config: { networks: ["base-sepolia"] } };
    const context = ctx({ amount: "50.00", network: "base-sepolia" });
    const a = run([r1, r2], context);
    const b = run([r2, r1], context);
    expect(a.status).toBe("FAIL");
    expect(a.evaluation_hash).toBe(b.evaluation_hash);
  });
});

describe("Phase 4 — property invariants (ALLOW impossible)", () => {
  it("amount > maximum can never PASS regardless of other passing rules", () => {
    const rules: CompiledRule[] = [
      { rule_id: "amt", type: "AMOUNT_LIMIT", config: { maximum: "20.00" } },
      { rule_id: "net", type: "NETWORK_ALLOW", config: { networks: ["base-sepolia"] } },
      { rule_id: "asset", type: "ASSET_ALLOW", config: { assets: ["USDC"] } },
    ];
    for (const amount of ["20.01", "100", "999999.99"]) {
      const out = run(rules, ctx({ amount, network: "base-sepolia", asset: "USDC" }));
      expect(out.status).toBe("FAIL");
    }
  });
  it("blocked recipient can never PASS", () => {
    const rules: CompiledRule[] = [
      { rule_id: "amt", type: "AMOUNT_LIMIT", config: { maximum: "1000.00" } },
      { rule_id: "bl", type: "RECIPIENT_BLOCKLIST", config: { recipients: ["0xbad"] } },
    ];
    expect(run(rules, ctx({ amount: "1.00", recipient: "0xbad" })).status).toBe("FAIL");
  });
  it("wrong network can never PASS", () => {
    const rules: CompiledRule[] = [
      { rule_id: "net", type: "NETWORK_ALLOW", config: { networks: ["base-sepolia"] } },
    ];
    expect(run(rules, ctx({ network: "ethereum" })).status).toBe("FAIL");
  });
  it("expired capability makes execution impossible (FAIL)", () => {
    const rules: CompiledRule[] = [
      { rule_id: "amt", type: "AMOUNT_LIMIT", config: { maximum: "1000.00" } },
      { rule_id: "ce", type: "CAPABILITY_EXPIRY", config: {} },
    ];
    expect(run(rules, ctx({ amount: "1.00" }, { capabilityExpiresAt: "2026-09-11T11:00:00Z" })).status).toBe("FAIL");
  });
  it("a single VIOLATION overrides many PASS/REVIEW results (no ALLOW)", () => {
    const rules: CompiledRule[] = [
      { rule_id: "h", type: "HUMAN_APPROVAL", config: {} },
      { rule_id: "amt", type: "AMOUNT_LIMIT", config: { maximum: "5.00" } },
    ];
    expect(run(rules, ctx({ amount: "500.00" })).status).toBe("FAIL");
  });
});
