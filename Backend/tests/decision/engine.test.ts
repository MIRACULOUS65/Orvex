/**
 * Phase 10 — Decision Engine tests (Tasks 10.2-10.7 + critical security tests 5-7,12-13 + property tests).
 *
 * Pure/in-memory. Proves deterministic precedence: higher-priority hard failures can
 * never be overridden by lower-priority signals (AI verdict, human approval). AI is
 * never authority. Includes the required property invariants.
 */
import { describe, expect, it } from "vitest";
import { DecisionEngine, type DecisionInput, type DecisionHashContext } from "@/decision/index";

const engine = new DecisionEngine();

/** A baseline input where every condition is satisfied (=> ALLOW). */
function baseInput(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    agentActive: true,
    intentValid: true,
    capabilityValid: true,
    constitutionCompatible: true,
    policyEvaluation: { status: "PASS", policy_id: "p1", policy_version: 1, evaluation_hash: "h1" },
    transactionGate: { status: "MATCH", mismatches: [] },
    simulationRequired: true,
    simulationOutcome: "CONTINUE",
    simulationBinding: { status: "VALID" },
    contextStale: false,
    approval: { required: false },
    aiRecommendedHandling: "PROCEED_CANDIDATE",
    ...overrides,
  };
}

describe("Phase 10 — ALLOW only when everything is satisfied", () => {
  it("ALLOWs a fully-compliant context", () => {
    expect(engine.decide(baseInput()).result).toBe("ALLOW");
  });
});

describe("Phase 10 — precedence + critical security tests", () => {
  it("CRITICAL 5: AI LOW risk + blocked recipient (policy FAIL) -> DENY", () => {
    const out = engine.decide(baseInput({
      aiRecommendedHandling: "PROCEED_CANDIDATE",
      policyEvaluation: { status: "FAIL", policy_id: "p1", policy_version: 1, evaluation_hash: "h" },
    }));
    expect(out.result).toBe("DENY");
    expect(out.determinant).toBe("policy_violation");
  });

  it("CRITICAL 6: AI HIGH risk + policy REVIEW -> REVIEW", () => {
    const out = engine.decide(baseInput({
      aiRecommendedHandling: "DENY_RECOMMENDED",
      policyEvaluation: { status: "REVIEW", policy_id: "p1", policy_version: 1, evaluation_hash: "h" },
    }));
    expect(out.result).toBe("REVIEW");
  });

  it("CRITICAL 7: simulation FAIL + human APPROVED -> DENY (approval cannot override sim)", () => {
    const out = engine.decide(baseInput({
      simulationOutcome: "DENY",
      approval: { required: true, status: "APPROVED" },
    }));
    expect(out.result).toBe("DENY");
    expect(out.determinant).toBe("simulation_deny");
  });

  it("wrong network (transaction MISMATCH) + human APPROVED -> DENY", () => {
    const out = engine.decide(baseInput({
      transactionGate: { status: "MISMATCH", mismatches: [{ field: "network", expected: "base-sepolia", actual: "base" }] },
      approval: { required: true, status: "APPROVED" },
    }));
    expect(out.result).toBe("DENY");
    expect(out.determinant).toBe("transaction_mismatch");
  });

  it("expired capability + human APPROVED -> DENY", () => {
    const out = engine.decide(baseInput({
      capabilityValid: false,
      approval: { required: true, status: "APPROVED" },
    }));
    expect(out.result).toBe("DENY");
    expect(out.determinant).toBe("capability_invalid");
  });

  it("new-recipient / required approval pending -> REVIEW", () => {
    const out = engine.decide(baseInput({ approval: { required: true, status: "PENDING" } }));
    expect(out.result).toBe("REVIEW");
    expect(out.determinant).toBe("approval_required");
  });

  it("approval DENIED -> DENY; approval EXPIRED -> DENY; approval MISMATCH -> DENY", () => {
    expect(engine.decide(baseInput({ approval: { required: true, status: "DENIED" } })).result).toBe("DENY");
    expect(engine.decide(baseInput({ approval: { required: true, status: "EXPIRED" } })).result).toBe("DENY");
    expect(engine.decide(baseInput({ approval: { required: true, status: "MISMATCH" } })).result).toBe("DENY");
  });

  it("required approval APPROVED + all else valid -> ALLOW", () => {
    expect(engine.decide(baseInput({ approval: { required: true, status: "APPROVED" } })).result).toBe("ALLOW");
  });

  it("mandatory simulation missing -> DENY (fail closed)", () => {
    const out = engine.decide(baseInput({ simulationOutcome: undefined }));
    expect(out.result).toBe("DENY");
    expect(out.determinant).toBe("simulation_required");
  });

  it("stale simulation binding -> DENY", () => {
    const out = engine.decide(baseInput({ simulationBinding: { status: "STALE" } }));
    expect(out.result).toBe("DENY");
  });

  it("platform invariant violated -> DENY (highest precedence)", () => {
    const out = engine.decide(baseInput({ platformInvariantViolated: true, policyEvaluation: { status: "PASS", policy_id: "p", policy_version: 1, evaluation_hash: "h" } }));
    expect(out.result).toBe("DENY");
    expect(out.determinant).toBe("platform_invariant");
  });

  it("stale context -> DENY", () => {
    expect(engine.decide(baseInput({ contextStale: true })).result).toBe("DENY");
  });
});

describe("Phase 10 — decision context hash (§10.6)", () => {
  const base: DecisionHashContext = {
    intentId: "i1",
    proposalId: "p1",
    policyId: "pol1",
    policyVersion: 1,
    policyEvaluationHash: "peh",
    securityAssessmentId: "sa1",
    transactionId: "t1",
    transactionPayloadHash: "tph",
    simulationId: "s1",
    approvalContextHash: null,
  };

  it("CRITICAL 12: same canonical context -> same hash", () => {
    expect(engine.contextHash(base)).toBe(engine.contextHash({ ...base }));
  });

  it("CRITICAL 13: materially changed context -> different hash", () => {
    expect(engine.contextHash({ ...base, transactionPayloadHash: "different" })).not.toBe(engine.contextHash(base));
    expect(engine.contextHash({ ...base, policyVersion: 2 })).not.toBe(engine.contextHash(base));
  });
});

describe("Phase 10 — property invariants (Decision != ALLOW)", () => {
  it("IF recipient hard-blocked (policy FAIL) THEN != ALLOW", () => {
    expect(engine.decide(baseInput({ policyEvaluation: { status: "FAIL", policy_id: "p", policy_version: 1, evaluation_hash: "h" } })).result).not.toBe("ALLOW");
  });
  it("IF transaction differs from proposal THEN != ALLOW", () => {
    expect(engine.decide(baseInput({ transactionGate: { status: "MISMATCH", mismatches: [{ field: "amount", expected: "5", actual: "6" }] } })).result).not.toBe("ALLOW");
  });
  it("IF mandatory simulation fails THEN != ALLOW", () => {
    expect(engine.decide(baseInput({ simulationOutcome: "DENY" })).result).not.toBe("ALLOW");
  });
  it("IF required approval absent THEN != ALLOW", () => {
    expect(engine.decide(baseInput({ approval: { required: true, status: "NONE" } })).result).not.toBe("ALLOW");
  });
  it("IF approval context differs (MISMATCH) THEN != ALLOW", () => {
    expect(engine.decide(baseInput({ approval: { required: true, status: "MISMATCH" } })).result).not.toBe("ALLOW");
  });
  it("IF capability invalid THEN != ALLOW", () => {
    expect(engine.decide(baseInput({ capabilityValid: false })).result).not.toBe("ALLOW");
  });
  it("an AI PROCEED_CANDIDATE can never by itself turn a hard failure into ALLOW", () => {
    // Every hard-failure dimension, with AI screaming PROCEED, still not ALLOW.
    for (const bad of [
      { policyEvaluation: { status: "FAIL" as const, policy_id: "p", policy_version: 1, evaluation_hash: "h" } },
      { capabilityValid: false },
      { transactionGate: { status: "MISMATCH" as const, mismatches: [] } },
      { simulationOutcome: "DENY" as const },
      { contextStale: true },
    ]) {
      const out = engine.decide(baseInput({ ...bad, aiRecommendedHandling: "PROCEED_CANDIDATE" }));
      expect(out.result).not.toBe("ALLOW");
    }
  });
});

describe("Phase 10 — determinism", () => {
  it("identical inputs produce identical results", () => {
    const input = baseInput();
    const a = engine.decide(input);
    const b = engine.decide(input);
    expect(a).toEqual(b);
  });
});
