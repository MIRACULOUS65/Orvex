/**
 * Phase 2 — contract round-trip tests (Task 2.3).
 *
 * For each major schema: parse a fixture -> serialize -> parse again -> assert semantic
 * equality between the two parsed objects. This proves the schemas are stable under
 * JSON serialization (no field is dropped, reshaped, or coerced differently on a second
 * pass) — the property downstream services rely on when relaying contract objects.
 */
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

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

const cases: Array<{ name: string; schema: ZodType; fixture: string }> = [
  { name: "Intent", schema: Intent, fixture: "intent.valid.json" },
  { name: "ActionProposal", schema: ActionProposal, fixture: "action-proposal.valid.json" },
  { name: "SecurityAssessment", schema: SecurityAssessment, fixture: "security-assessment.valid.json" },
  { name: "PolicyEvaluation", schema: PolicyEvaluation, fixture: "policy-evaluation.valid.json" },
  { name: "Decision", schema: Decision, fixture: "decision.valid.json" },
  { name: "ExecutionRequest", schema: ExecutionRequest, fixture: "execution-request.valid.json" },
  { name: "ReceiptVerification", schema: ReceiptVerification, fixture: "receipt-verification.valid.json" },
];

describe("Phase 2 — round-trip: object -> serialize -> parse -> semantic equality", () => {
  for (const c of cases) {
    it(`${c.name} round-trips to a semantically equal object`, () => {
      const first = c.schema.parse(loadFixture(c.fixture));
      const serialized = JSON.stringify(first);
      const second = c.schema.parse(JSON.parse(serialized));
      expect(second).toEqual(first);
      // Serializing the second parse again must be byte-identical to the first.
      expect(JSON.stringify(second)).toBe(serialized);
    });
  }
});
