/**
 * Phase 7 — PERMANENT Broken-AI regression test (Task 7.8).
 *
 * This test must remain in the suite forever. It encodes the core product invariant:
 *
 *     "AI may recommend. Deterministic systems authorize."
 *
 * We install a deliberately-broken AI provider that ALWAYS returns the most permissive
 * possible SecurityAssessment (LOW risk, no threat, PASS, PROCEED_CANDIDATE). Then we
 * submit transactions that must never be authorized — a blocked recipient, an over-limit
 * amount, and a wrong network — and assert that the deterministic Policy Engine still
 * FAILS them. The AI's verdict is irrelevant to authorization; only deterministic rules
 * decide. If this test ever fails, AI intelligence has leaked into authority and the
 * security model is broken.
 */
import { describe, expect, it } from "vitest";
import { PolicyEngine, type CompiledRule, type EvaluationContext } from "@/policy/index";
import type { AiProvider, AiResult } from "@/application/clients/ai/index";
import { SecurityAssessment } from "@/shared/contracts/index";

/** An AI that always says everything is safe — the worst-case adversarial/broken model. */
class AlwaysAllowBrokenAi implements AiProvider {
  async createIntent(): Promise<AiResult<never>> {
    throw new Error("not needed for this test");
  }

  async analyzeProposal(): Promise<AiResult<ReturnType<typeof SecurityAssessment.parse>>> {
    const data = SecurityAssessment.parse({
      assessment_id: "broken_1",
      proposal_id: "proposal_1",
      intent_verification: { status: "PASS", intent_match: true, score: 1 },
      threat_assessment: { detected: false, recommended_handling: "MONITOR" },
      reputation_assessment: { level: "HIGH" },
      anomaly_assessment: { level: "LOW" },
      risk_assessment: { level: "LOW" },
      overall_assessment: {
        status: "LOW_RISK",
        confidence: 1,
        summary: "everything is fine (it is not)",
        recommended_handling: "PROCEED_CANDIDATE",
      },
      created_at: "2026-09-11T12:00:00Z",
    });
    return { status: "OK", data, requestId: "broken" };
  }
}

const engine = new PolicyEngine();
const NOW = "2026-09-11T12:00:00Z";

/** The deterministic company policy (independent of any AI output). */
const policyRules: CompiledRule[] = [
  { rule_id: "amt", type: "AMOUNT_LIMIT", config: { maximum: "20.00" } },
  { rule_id: "net", type: "NETWORK_ALLOW", config: { networks: ["base-sepolia"] } },
  { rule_id: "block", type: "RECIPIENT_BLOCKLIST", config: { recipients: ["0xbadactor"] } },
];

function evaluate(tx: Partial<EvaluationContext["transaction"]>) {
  const context: EvaluationContext = { transaction: { action: "PAY", ...tx }, now: NOW };
  return engine.evaluate({ policyId: "policy_1", policyVersion: 1, rules: policyRules, context });
}

describe("Phase 7 — Broken-AI cannot cause authorization (PERMANENT)", () => {
  const brokenAi = new AlwaysAllowBrokenAi();

  it("the broken AI really does claim maximal safety", async () => {
    const res = await brokenAi.analyzeProposal();
    expect(res.data.overall_assessment.recommended_handling).toBe("PROCEED_CANDIDATE");
    expect(res.data.threat_assessment.detected).toBe(false);
    expect(res.data.risk_assessment.level).toBe("LOW");
  });

  it("blocked recipient is DENIED despite AI saying PROCEED", async () => {
    await brokenAi.analyzeProposal(); // AI consulted but advisory only
    const out = evaluate({ amount: "1.00", network: "base-sepolia", recipient: "0xbadactor" });
    expect(out.status).toBe("FAIL");
  });

  it("over-limit amount is DENIED despite AI saying LOW risk", async () => {
    await brokenAi.analyzeProposal();
    const out = evaluate({ amount: "500.00", network: "base-sepolia", recipient: "0xok" });
    expect(out.status).toBe("FAIL");
  });

  it("wrong network is DENIED despite AI saying NO THREAT", async () => {
    await brokenAi.analyzeProposal();
    const out = evaluate({ amount: "1.00", network: "ethereum", recipient: "0xok" });
    expect(out.status).toBe("FAIL");
  });

  it("only a genuinely-compliant transaction passes deterministic policy (AI verdict irrelevant)", async () => {
    await brokenAi.analyzeProposal();
    const out = evaluate({ amount: "10.00", network: "base-sepolia", recipient: "0xok" });
    expect(out.status).toBe("PASS");
  });
});
