/**
 * Phase 2 — authority-boundary tests (Task 2.5).
 *
 * Enforces the core SentinelPay invariant: "AI may recommend. Deterministic systems
 * authorize." The advisory SecurityAssessment (and every sub-assessment) MUST NOT be
 * able to represent direct authorization.
 *
 * These tests prove three things:
 *   1. The SecurityAssessment schema shape declares NO authority field.
 *   2. Even if an attacker/model smuggles `authorized`/`execute`/`sign` into the JSON,
 *      parsing STRIPS them — the parsed object can never carry them downstream.
 *   3. The only decision-shaped field, `recommended_handling`, is limited to advisory
 *      verbs and rejects an authorization verb like "AUTHORIZE".
 *
 * The contrast case: `Decision.result` (ALLOW/REVIEW/DENY) is where authorization
 * legitimately lives, so it is asserted separately to make the boundary explicit.
 */
import { describe, expect, it } from "vitest";

import {
  SecurityAssessment,
  ThreatAssessment,
  OverallAssessment,
  FORBIDDEN_AUTHORITY_FIELDS,
  Decision,
} from "@/shared/contracts/index";
import { loadFixture } from "./fixtures";

function deepKeys(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) deepKeys(item, acc);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      acc.add(k);
      deepKeys(v, acc);
    }
  }
  return acc;
}

describe("Phase 2 — SecurityAssessment cannot become an authorization object", () => {
  it("the parsed valid assessment contains no forbidden authority field (recursively)", () => {
    const parsed = SecurityAssessment.parse(loadFixture("security-assessment.valid.json"));
    const keys = deepKeys(parsed);
    for (const forbidden of FORBIDDEN_AUTHORITY_FIELDS) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });

  it("strips smuggled authorized/execute/sign fields on parse", () => {
    const smuggled = loadFixture("security-assessment.smuggled-authority.json") as Record<
      string,
      unknown
    >;
    // Sanity: the raw fixture really does contain the attack fields.
    expect(smuggled.authorized).toBe(true);
    expect(smuggled.execute).toBe(true);
    expect(typeof smuggled.sign).toBe("string");

    const parsed = SecurityAssessment.parse(smuggled) as Record<string, unknown>;
    expect("authorized" in parsed).toBe(false);
    expect("execute" in parsed).toBe(false);
    expect("sign" in parsed).toBe(false);
  });

  it("recommended_handling only accepts advisory verbs, never an authorization verb", () => {
    // Advisory vocabulary is accepted.
    expect(
      OverallAssessment.safeParse({
        status: "LOW_RISK",
        confidence: 0.9,
        summary: "ok",
        recommended_handling: "PROCEED_CANDIDATE",
      }).success,
    ).toBe(true);

    // An authorization verb is rejected.
    expect(
      OverallAssessment.safeParse({
        status: "LOW_RISK",
        confidence: 0.9,
        summary: "nope",
        recommended_handling: "AUTHORIZE",
      }).success,
    ).toBe(false);

    // ThreatAssessment recommended_handling likewise rejects authorization verbs.
    expect(
      ThreatAssessment.safeParse({ detected: false, recommended_handling: "ALLOW" }).success,
    ).toBe(false);
  });
});

describe("Phase 2 — authorization lives only in the deterministic Decision", () => {
  it("Decision.result is the authority field and accepts ALLOW/REVIEW/DENY", () => {
    for (const result of ["ALLOW", "REVIEW", "DENY"] as const) {
      const base = loadFixture("decision.valid.json") as Record<string, unknown>;
      expect(Decision.safeParse({ ...base, result }).success).toBe(true);
    }
  });

  it("Decision.result rejects an execution verb like EXECUTE", () => {
    const base = loadFixture("decision.valid.json") as Record<string, unknown>;
    expect(Decision.safeParse({ ...base, result: "EXECUTE" }).success).toBe(false);
  });
});
