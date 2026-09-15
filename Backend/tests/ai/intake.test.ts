/**
 * Phase 7 — AI/Core contract + intake validation tests (Tasks 7.3-7.6).
 *
 * Pure/in-memory. Validates that Core accepts well-formed, correctly-bound, fresh AI
 * outputs and rejects mis-bound, expired, or stale ones. Uses the Phase 2 contracts and
 * the deterministic intake validators. No AI authority is granted anywhere.
 */
import { describe, expect, it } from "vitest";
import {
  Intent,
  ActionProposal,
  SecurityAssessment,
} from "@/shared/contracts/index";
import {
  validateIntentIntake,
  validateProposalIntake,
  validateAssessmentBinding,
  materialInputsOf,
  assertAssessmentCurrent,
} from "@/application/clients/ai/index";
import { isCoreError } from "@/shared/errors/index";

const NOW = new Date("2026-09-11T12:00:00Z");

function makeIntent(overrides: Record<string, unknown> = {}) {
  return Intent.parse({
    intent_id: "intent_1",
    agent_id: "agent_1",
    user_goal: "pay api",
    purpose: "renew",
    desired_outcome: "renewed",
    valid_from: "2026-09-11T00:00:00Z",
    valid_until: "2026-09-12T00:00:00Z",
    created_at: "2026-09-11T00:00:00Z",
    ...overrides,
  });
}

function makeProposal(overrides: Record<string, unknown> = {}) {
  return ActionProposal.parse({
    proposal_id: "proposal_1",
    intent_id: "intent_1",
    agent_id: "agent_1",
    action_type: "PAY",
    purpose: "renew",
    amount: { value: "10.00", currency: "USDC" },
    recipient: { type: "SERVICE", address: "0xrecipient", network: "base-sepolia" },
    network: "base-sepolia",
    created_at: "2026-09-11T12:00:00Z",
    ...overrides,
  });
}

function makeAssessment(overrides: Record<string, unknown> = {}) {
  return SecurityAssessment.parse({
    assessment_id: "assess_1",
    proposal_id: "proposal_1",
    intent_verification: { status: "PASS", intent_match: true, score: 1 },
    threat_assessment: { detected: false },
    reputation_assessment: { level: "MEDIUM" },
    anomaly_assessment: { level: "LOW" },
    risk_assessment: { level: "LOW" },
    overall_assessment: { status: "LOW_RISK", confidence: 0.9, summary: "ok", recommended_handling: "PROCEED_CANDIDATE" },
    created_at: "2026-09-11T12:00:00Z",
    ...overrides,
  });
}

describe("Phase 7 — Intent intake", () => {
  it("accepts a valid, bound, unexpired intent", () => {
    expect(() => validateIntentIntake(makeIntent(), { companyId: "c1", agentId: "agent_1" }, NOW)).not.toThrow();
  });
  it("rejects a wrong-agent intent", () => {
    expect(() => validateIntentIntake(makeIntent(), { companyId: "c1", agentId: "agent_2" }, NOW)).toThrow();
  });
  it("rejects an expired intent", () => {
    const expired = makeIntent({ valid_until: "2026-09-11T00:00:00Z" });
    try {
      validateIntentIntake(expired, { companyId: "c1", agentId: "agent_1" }, NOW);
      throw new Error("should have thrown");
    } catch (e) {
      expect(isCoreError(e)).toBe(true);
    }
  });
});

describe("Phase 7 — ActionProposal intake", () => {
  it("accepts a correctly-bound proposal", () => {
    expect(() => validateProposalIntake(makeProposal(), { intentId: "intent_1", agentId: "agent_1" })).not.toThrow();
  });
  it("rejects a wrong-intent proposal", () => {
    expect(() => validateProposalIntake(makeProposal(), { intentId: "intent_X", agentId: "agent_1" })).toThrow();
  });
  it("rejects a wrong-agent proposal", () => {
    expect(() => validateProposalIntake(makeProposal(), { intentId: "intent_1", agentId: "agent_X" })).toThrow();
  });
});

describe("Phase 7 — SecurityAssessment binding + freshness", () => {
  it("accepts an assessment bound to the proposal and fresh", () => {
    expect(() =>
      validateAssessmentBinding(makeAssessment(), { proposalId: "proposal_1", maxAgeMs: 600_000 }, NOW),
    ).not.toThrow();
  });
  it("rejects an assessment for a different proposal", () => {
    expect(() =>
      validateAssessmentBinding(makeAssessment({ proposal_id: "proposal_OTHER" }), { proposalId: "proposal_1" }, NOW),
    ).toThrow();
  });
  it("rejects a stale (too old) assessment", () => {
    const old = makeAssessment({ created_at: "2026-09-11T11:00:00Z" });
    expect(() =>
      validateAssessmentBinding(old, { proposalId: "proposal_1", maxAgeMs: 60_000 }, NOW),
    ).toThrow();
  });
});

describe("Phase 7 — stale-input detection (material change)", () => {
  it("flags an assessment stale when the amount changed", () => {
    const prev = materialInputsOf(makeProposal({ amount: { value: "10.00", currency: "USDC" } }));
    const curr = materialInputsOf(makeProposal({ amount: { value: "999.00", currency: "USDC" } }));
    expect(() => assertAssessmentCurrent(prev, curr)).toThrow();
  });
  it("flags stale when the recipient changed", () => {
    const prev = materialInputsOf(makeProposal({ recipient: { type: "SERVICE", address: "0xA" } }));
    const curr = materialInputsOf(makeProposal({ recipient: { type: "SERVICE", address: "0xB" } }));
    expect(() => assertAssessmentCurrent(prev, curr)).toThrow();
  });
  it("does not flag when material inputs are unchanged", () => {
    const p = makeProposal();
    expect(() => assertAssessmentCurrent(materialInputsOf(p), materialInputsOf(p))).not.toThrow();
  });
});
