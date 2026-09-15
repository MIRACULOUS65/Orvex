/**
 * Phase 2 — unknown-field / forward-compatibility tests (Task 2.4).
 *
 * Consumer-side AI-boundary contracts may accept unknown fields (the AI layer can add
 * forward-compatible fields without breaking the Backend). We assert that:
 *   - a consumer contract (Intent) preserves an unknown field via `.passthrough()`
 *   - required fields are still enforced (a producer must not omit them)
 *
 * The advisory SecurityAssessment is deliberately the exception: it STRIPS unknown
 * fields rather than passing them through, so unknown keys cannot survive parsing. That
 * behavior is asserted here and reinforced in the authority-boundary tests.
 */
import { describe, expect, it } from "vitest";

import { Intent, SecurityAssessment } from "@/shared/contracts/index";
import { loadFixture } from "./fixtures";

describe("Phase 2 — forward-compat: consumers may ignore unknown fields", () => {
  it("Intent preserves an unknown forward-compat field", () => {
    const base = loadFixture("intent.valid.json") as Record<string, unknown>;
    const withExtra = { ...base, future_field: "some-new-thing" };
    const parsed = Intent.parse(withExtra) as Record<string, unknown>;
    expect(parsed.future_field).toBe("some-new-thing");
  });

  it("Intent still rejects a missing REQUIRED field (producers must not omit)", () => {
    const base = loadFixture("intent.valid.json") as Record<string, unknown>;
    const { agent_id: _omitted, ...withoutRequired } = base;
    expect(Intent.safeParse(withoutRequired).success).toBe(false);
  });

  it("SecurityAssessment strips unknown fields instead of passing them through", () => {
    const base = loadFixture("security-assessment.valid.json") as Record<string, unknown>;
    const withExtra = { ...base, future_field: "x" };
    const parsed = SecurityAssessment.parse(withExtra) as Record<string, unknown>;
    expect("future_field" in parsed).toBe(false);
  });
});
