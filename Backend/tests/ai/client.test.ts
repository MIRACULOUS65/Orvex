/**
 * Phase 7 — AI service client tests (Tasks 7.1/7.2/7.5/7.7).
 *
 * Uses an injected fetch to exercise the client without a live AI service: valid
 * Intent/SecurityAssessment envelopes parse; malformed AI responses raise a typed error
 * (schema validity is enforced at the boundary); auth failure and provider/network
 * failure surface as errors (so callers can fail closed — never provider-failure->ALLOW).
 */
import { describe, expect, it } from "vitest";
import { AiServiceClient } from "@/application/clients/ai/index";
import { isCoreError } from "@/shared/errors/index";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const validAssessment = {
  assessment_id: "a1",
  proposal_id: "p1",
  intent_verification: { status: "PASS", intent_match: true, score: 1 },
  threat_assessment: { detected: false },
  reputation_assessment: { level: "MEDIUM" },
  anomaly_assessment: { level: "LOW" },
  risk_assessment: { level: "LOW" },
  overall_assessment: { status: "LOW_RISK", confidence: 0.9, summary: "ok", recommended_handling: "PROCEED_CANDIDATE" },
  created_at: "2026-09-11T12:00:00Z",
};

describe("Phase 7 — AI client parsing + failure behavior", () => {
  it("parses a valid SecurityAssessment envelope", async () => {
    const client = new AiServiceClient({
      baseUrl: "http://ai.local",
      serviceToken: "tok",
      fetchImpl: async () =>
        jsonResponse({ schema_version: "envelope.v1", request_id: "r1", status: "OK", data: validAssessment, error: null }),
    });
    const res = await client.analyzeProposal({ intent: {}, proposal: {} });
    expect(res.data.overall_assessment.status).toBe("LOW_RISK");
  });

  it("rejects a malformed AI response (schema validity enforced at boundary)", async () => {
    const client = new AiServiceClient({
      baseUrl: "http://ai.local",
      fetchImpl: async () =>
        jsonResponse({ schema_version: "envelope.v1", request_id: "r1", status: "OK", data: { nonsense: true }, error: null }),
    });
    await expect(client.analyzeProposal({ intent: {}, proposal: {} })).rejects.toSatisfy(isCoreError);
  });

  it("surfaces an auth failure (401) as an error", async () => {
    const client = new AiServiceClient({
      baseUrl: "http://ai.local",
      fetchImpl: async () => new Response("no", { status: 401 }),
    });
    await expect(client.analyzeProposal({ intent: {}, proposal: {} })).rejects.toSatisfy(isCoreError);
  });

  it("surfaces a network failure as a provider error (caller must fail closed)", async () => {
    const client = new AiServiceClient({
      baseUrl: "http://ai.local",
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    await expect(client.analyzeProposal({ intent: {}, proposal: {} })).rejects.toSatisfy(isCoreError);
  });

  it("sends the Bearer service token", async () => {
    let seenAuth: string | null = null;
    const client = new AiServiceClient({
      baseUrl: "http://ai.local",
      serviceToken: "secret-token",
      fetchImpl: async (_url, init) => {
        seenAuth = new Headers(init?.headers).get("authorization");
        return jsonResponse({ schema_version: "envelope.v1", request_id: "r1", status: "OK", data: validAssessment, error: null });
      },
    });
    await client.analyzeProposal({ intent: {}, proposal: {} });
    expect(seenAuth).toBe("Bearer secret-token");
  });
});
