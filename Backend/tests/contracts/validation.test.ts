/**
 * Phase 2 — contract validation tests (Tasks 2.2 + exit criteria).
 *
 * Proves that every core contract validates its valid fixture and REJECTS its invalid
 * fixture. Invalid fixtures exercise the two most important failure modes for this
 * project: float money (forbidden by CONTRACTS.md §4.3) and out-of-vocabulary enums
 * (e.g. a decision result of "EXECUTE", or an advisory recommendation of "AUTHORIZE").
 */
import { describe, expect, it } from "vitest";

import {
  Intent,
  ActionProposal,
  SecurityAssessment,
  PolicyEvaluation,
  Decision,
  ExecutionRequest,
  ReceiptVerification,
} from "@/shared/contracts/index";
import { loadFixture } from "./fixtures";

const cases = [
  { name: "Intent", schema: Intent, valid: "intent.valid.json", invalid: "intent.invalid.json" },
  {
    name: "ActionProposal",
    schema: ActionProposal,
    valid: "action-proposal.valid.json",
    invalid: "action-proposal.invalid.json",
  },
  {
    name: "SecurityAssessment",
    schema: SecurityAssessment,
    valid: "security-assessment.valid.json",
    invalid: "security-assessment.invalid.json",
  },
  {
    name: "PolicyEvaluation",
    schema: PolicyEvaluation,
    valid: "policy-evaluation.valid.json",
    invalid: "policy-evaluation.invalid.json",
  },
  { name: "Decision", schema: Decision, valid: "decision.valid.json", invalid: "decision.invalid.json" },
  {
    name: "ExecutionRequest",
    schema: ExecutionRequest,
    valid: "execution-request.valid.json",
    invalid: "execution-request.invalid.json",
  },
  {
    name: "ReceiptVerification",
    schema: ReceiptVerification,
    valid: "receipt-verification.valid.json",
    invalid: "receipt-verification.invalid.json",
  },
] as const;

describe("Phase 2 — core contracts validate their valid fixtures", () => {
  for (const c of cases) {
    it(`${c.name} accepts its valid fixture`, () => {
      const result = c.schema.safeParse(loadFixture(c.valid));
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    });
  }
});

describe("Phase 2 — core contracts reject their invalid fixtures", () => {
  for (const c of cases) {
    it(`${c.name} rejects its invalid fixture`, () => {
      const result = c.schema.safeParse(loadFixture(c.invalid));
      expect(result.success).toBe(false);
    });
  }
});

describe("Phase 2 — money is decimal-string, never float", () => {
  it("rejects a float amount on an ActionProposal", () => {
    const base = loadFixture("action-proposal.valid.json") as Record<string, unknown>;
    const mutated = { ...base, amount: { value: 4.2, currency: "USDC" } };
    expect(ActionProposal.safeParse(mutated).success).toBe(false);
  });

  it("rejects exponent-notation money strings", () => {
    const base = loadFixture("action-proposal.valid.json") as Record<string, unknown>;
    const mutated = { ...base, amount: { value: "1e3", currency: "USDC" } };
    expect(ActionProposal.safeParse(mutated).success).toBe(false);
  });

  it("accepts a well-formed decimal-string amount", () => {
    const base = loadFixture("action-proposal.valid.json") as Record<string, unknown>;
    const mutated = { ...base, amount: { value: "100.00", currency: "USDC" } };
    expect(ActionProposal.safeParse(mutated).success).toBe(true);
  });
});
