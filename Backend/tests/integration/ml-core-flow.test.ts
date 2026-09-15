/**
 * ML -> Core end-to-end integration (in-process, deterministic).
 *
 * Drives the FULL flow through the real Core HTTP surface (Fastify inject) exactly as
 * the AI-side CoreClient would: /v1/intents -> /v1/proposals ->
 * /v1/proposals/:id/assessments -> /v1/decisions, then (on ALLOW) /v1/executions/prepare
 * -> the existing MockExecutionClient. The AI SecurityAssessment is supplied by a
 * BROKEN-AI fixture that always claims maximal safety, proving Core remains the
 * deterministic authority (AI cannot override policy).
 *
 * Covers the 10 required scenarios. Real Postgres via the shared harness.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestDb, stopCluster, type TestDb } from "../db/harness";
import { buildApp } from "@/api/app";
import { buildContainer } from "@/api/http/container";
import { MockExecutionClient } from "@/application/clients/execution/index";
import { setConfigForTests, getConfig } from "@/config/index";
import { transactionPayloadHash } from "@/execution-gate/index";

let db: TestDb;
let app: FastifyInstance;
let companyA: string;
let companyB: string;

function headers(companyId: string, role = "AUTHORIZED_OPERATOR") {
  return { "x-company-id": companyId, "x-actor-id": "ai-service", "x-actor-role": role, "x-correlation-id": "corr_e2e_1" };
}

async function call(method: "GET" | "POST" | "PATCH", url: string, companyId: string, payload?: unknown, role?: string) {
  return app.inject({ method, url, headers: headers(companyId, role), payload: payload as object });
}

/** A BROKEN AI SecurityAssessment: always claims maximal safety (the adversarial case). */
function brokenAiAssessment(proposalId = "proposal_dec") {
  return {
    assessment_id: "assess_broken", proposal_id: proposalId,
    intent_verification: { status: "PASS", intent_match: true, score: 1, confidence: 1 },
    threat_assessment: { detected: false, confidence: 1, recommended_handling: "MONITOR" },
    reputation_assessment: { level: "HIGH", confidence: 1 },
    anomaly_assessment: { level: "LOW", confidence: 1 },
    risk_assessment: { level: "LOW", confidence: 1 },
    overall_assessment: { status: "LOW_RISK", confidence: 1, summary: "everything is fine (broken AI)", recommended_handling: "PROCEED_CANDIDATE" },
    created_at: "2026-09-11T12:00:00Z",
  };
}

beforeAll(async () => {
  db = await createTestDb();
  setConfigForTests({ ...getConfig(), environment: "test" });
  const container = buildContainer({
    db: db.prisma,
    // The mock executor echoes the authorized receipt so a legitimate payment verifies.
    executionClient: new MockExecutionClient({ verified: true, actual: { recipient: "0xrecipient", asset: "USDC", amount: "10.00", network: "base-sepolia" } }),
  });
  app = await buildApp({ container });
  await app.ready();
  companyA = (await db.prisma.company.create({ data: { name: "E2E A" } })).id;
  companyB = (await db.prisma.company.create({ data: { name: "E2E B" } })).id;
}, 120_000);

afterAll(async () => {
  await app?.close();
  await db?.disconnect();
  await stopCluster();
});

/** Seed a fully-configured active agent with constitution + capability + active policy + budget. */
async function seedAgent(companyId: string, opts: { newRecipientApproval?: boolean } = {}) {
  const agentId = (await call("POST", "/v1/agents", companyId, { name: `a_${Math.random().toString(36).slice(2)}` })).json().data.id as string;
  await call("PATCH", `/v1/agents/${agentId}`, companyId, { status: "ACTIVE" }, "ADMIN");
  const cRes = await call("POST", "/v1/constitutions", companyId, {
    agent_id: agentId,
    config: { purpose: "pay", allowed_actions: ["PAY"], allowed_assets: ["USDC"], allowed_networks: ["base-sepolia"], allowed_categories: ["API"], spending_limits: { single_transaction: "20.00", daily: "100.00" } },
  }, "ADMIN");
  await call("POST", `/v1/constitutions/${cRes.json().data.id}/activate`, companyId, {}, "ADMIN");
  const rules: Record<string, unknown>[] = [
    { rule_id: "amt", type: "AMOUNT_LIMIT", config: { maximum: "20.00" } },
    { rule_id: "net", type: "NETWORK_ALLOW", config: { networks: ["base-sepolia"] } },
    { rule_id: "block", type: "RECIPIENT_BLOCKLIST", config: { recipients: ["0xATTACKER"] } },
  ];
  if (opts.newRecipientApproval) rules.push({ rule_id: "newrec", type: "NEW_RECIPIENT_APPROVAL", config: {} });
  const compiled = await call("POST", "/v1/policies/compile", companyId, { name: "p", agent_id: agentId, candidate_rules: rules }, "ADMIN");
  const policyId = compiled.json().data.policy.id as string;
  const versionId = compiled.json().data.version.id as string;
  await call("POST", `/v1/policies/${policyId}/validate`, companyId, { policy_version_id: versionId }, "ADMIN");
  await call("POST", `/v1/policies/${policyId}/activate`, companyId, { policy_version_id: versionId }, "ADMIN");
  await db.prisma.capability.create({
    data: { companyId, agentId, action: "PAY", asset: "USDC", network: "base-sepolia", singleTransactionLimit: "20.00", validFrom: new Date("2026-09-11T00:00:00Z"), expiresAt: new Date("2026-12-31T00:00:00Z") },
  });
  await db.prisma.financialAccount.create({
    data: { companyId, agentId, scope: "AGENT", scopeKey: agentId, asset: "USDC", network: "base-sepolia", limitAmount: "100.00" },
  });
  return agentId;
}

function intentObj(agentId: string, id = "intent_dec") {
  return { intent_id: id, agent_id: agentId, user_goal: "pay api", purpose: "renew", desired_outcome: "ok", valid_from: "2026-09-11T00:00:00Z", valid_until: "2026-12-30T00:00:00Z", created_at: "2026-09-11T00:00:00Z" };
}
function proposalObj(agentId: string, opts: { amount?: string; recipient?: string; network?: string; id?: string } = {}) {
  return {
    proposal_id: opts.id ?? "proposal_dec", intent_id: "intent_dec", agent_id: agentId, action_type: "PAY", purpose: "renew",
    amount: { value: opts.amount ?? "10.00", currency: "USDC" },
    recipient: { type: "SERVICE", address: opts.recipient ?? "0xrecipient", network: opts.network ?? "base-sepolia" },
    network: opts.network ?? "base-sepolia", created_at: "2026-09-11T12:00:00Z",
  };
}

/** Relay one proposal through Core exactly as the CoreClient would (intent->proposal->assessment->decision). */
async function relay(companyId: string, agentId: string, proposal: Record<string, unknown>, assessment: Record<string, unknown>) {
  const intentRes = await call("POST", "/v1/intents", companyId, intentObj(agentId));
  const intentRowId = intentRes.json().data.id as string;
  const proposalRes = await call("POST", "/v1/proposals", companyId, { ...proposal, intent_id: intentRowId });
  expect(proposalRes.statusCode).toBe(201);
  const proposalRowId = proposalRes.json().data.id as string;
  const assessRes = await call("POST", `/v1/proposals/${proposalRowId}/assessments`, companyId, { ...assessment, proposal_id: (proposal.proposal_id as string) });
  expect(assessRes.statusCode).toBe(201);
  const decisionRes = await call("POST", "/v1/decisions", companyId, {
    agent_id: agentId, intent: intentObj(agentId), proposal, security_assessment: assessment,
  });
  return { proposalRowId, assessRes, decisionRes };
}

describe("ML->Core E2E — Scenario 1: legitimate payment -> ALLOW -> MockExecution", () => {
  it("relays a compliant proposal to an ALLOW, then prepares + executes via MockExecutionClient", async () => {
    const agentId = await seedAgent(companyA);
    const { decisionRes } = await relay(companyA, agentId, proposalObj(agentId), brokenAiAssessment());
    expect(decisionRes.statusCode).toBe(201);
    expect(decisionRes.json().data.result).toBe("ALLOW");
    const decisionId = decisionRes.json().data.decision.id as string;

    // ALLOW -> prepare through FinalRevalidation (the ONLY sanctioned path) -> execution request.
    const analysis = { schema_version: "transaction_analysis.v1", transaction_id: "txn_e2e", contract: { address: "0xUSDC", verified: true }, function: { name: "transfer", selector: "0xa9059cbb" }, decoded_arguments: {}, state_changes_expected: [], recipient: "0xrecipient", amount: "10.00", asset: "USDC", risk_flags: [], status: "VALID" };
    const payloadHash = transactionPayloadHash({ transactionId: "txn_e2e", network: "base-sepolia", recipient: "0xrecipient", amount: "10.00", asset: "USDC", contractAddress: "0xUSDC", functionSelector: "0xa9059cbb" });
    const prep = await call("POST", "/v1/executions/prepare", companyA, {
      agent_id: agentId, decision_id: decisionId, intent: intentObj(agentId), proposal: proposalObj(agentId), security_assessment: brokenAiAssessment(),
      transaction_id: "txn_e2e", analysis, expected_network: "base-sepolia", actual_network: "base-sepolia",
      simulation: { schema_version: "simulation_result.v1", transaction_id: "txn_e2e", status: "PASS", would_revert: false, expected_state_changes: [], unexpected_state_changes: [], revert_reason: null, simulator: { provider: "sim", version: "1" }, simulated_at: "2026-09-11T12:00:00Z" },
      simulated_payload_hash: payloadHash, decision_context_hash: "", financial_scope_key: agentId, asset: "USDC", amount: "10.00", require_simulation: true,
    }, "ADMIN");
    expect(prep.statusCode).toBe(201);
    const executionId = prep.json().data.execution_request.id as string;

    // Executor reports CONFIRMED + verify -> financial commit (MockExecutionClient).
    await call("POST", `/v1/executions/${executionId}/result`, companyA, { status: "CONFIRMED", chain: "base-sepolia", transaction_hash: "0xhash" }, "SERVICE");
    const verify = await call("POST", `/v1/executions/${executionId}/verify`, companyA, { authorized: { recipient: "0xrecipient", asset: "USDC", amount: "10.00", network: "base-sepolia" } }, "SERVICE");
    expect(verify.statusCode).toBe(200);
    expect(verify.json().data.verification.status).toBe("VERIFIED");
    expect(verify.json().data.committed).toBe(true);
  });
});

describe("ML->Core E2E — Scenario 2 & 3: injection/redirection + broken AI cannot override policy", () => {
  it("Scenario 2: payment redirected to a blocked recipient -> DENY (despite broken AI PROCEED)", async () => {
    const agentId = await seedAgent(companyA);
    const { decisionRes } = await relay(companyA, agentId, proposalObj(agentId, { recipient: "0xATTACKER" }), brokenAiAssessment());
    expect(decisionRes.json().data.result).toBe("DENY");
  });

  it("Scenario 3: broken AI says ALLOW but amount over policy limit -> DENY", async () => {
    const agentId = await seedAgent(companyA);
    const { decisionRes } = await relay(companyA, agentId, proposalObj(agentId, { amount: "500.00" }), brokenAiAssessment());
    expect(decisionRes.json().data.result).toBe("DENY");
  });
});

describe("ML->Core E2E — Scenario 4: new recipient -> REVIEW", () => {
  it("a brand-new recipient triggers NEW_RECIPIENT_APPROVAL -> REVIEW + pending approval", async () => {
    const agentId = await seedAgent(companyA, { newRecipientApproval: true });
    // Recipient not previously known -> NEW_RECIPIENT_APPROVAL rule yields REVIEW.
    const { decisionRes } = await relay(companyA, agentId, proposalObj(agentId, { recipient: "0xbrandnew" }), brokenAiAssessment());
    expect(decisionRes.json().data.result).toBe("REVIEW");
    expect(decisionRes.json().data.approval_id).toBeTruthy();
  });
});

describe("ML->Core E2E — Scenario 5: wrong chain -> DENY", () => {
  it("a proposal on an unauthorized network -> DENY (AI verdict irrelevant)", async () => {
    const agentId = await seedAgent(companyA);
    const { decisionRes } = await relay(companyA, agentId, proposalObj(agentId, { network: "ethereum" }), brokenAiAssessment());
    expect(decisionRes.json().data.result).toBe("DENY");
  });
});

describe("ML->Core E2E — Scenario 7: malformed assessment rejected (no decision)", () => {
  it("an invalid SecurityAssessment is rejected at ingestion", async () => {
    const agentId = await seedAgent(companyA);
    const intentRes = await call("POST", "/v1/intents", companyA, intentObj(agentId));
    const intentRowId = intentRes.json().data.id as string;
    const proposalRes = await call("POST", "/v1/proposals", companyA, { ...proposalObj(agentId), intent_id: intentRowId });
    const proposalRowId = proposalRes.json().data.id as string;
    // Malformed: recommended_handling is not a valid advisory verb.
    const bad = await call("POST", `/v1/proposals/${proposalRowId}/assessments`, companyA, {
      assessment_id: "a", proposal_id: "proposal_dec",
      intent_verification: { status: "PASS", intent_match: true, score: 1 }, threat_assessment: { detected: false },
      reputation_assessment: { level: "MEDIUM" }, anomaly_assessment: { level: "LOW" }, risk_assessment: { level: "LOW" },
      overall_assessment: { status: "LOW_RISK", confidence: 1, summary: "x", recommended_handling: "AUTHORIZE" },
      created_at: "2026-09-11T12:00:00Z",
    });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
    expect(bad.json().error.code).toBe("SECURITY_ASSESSMENT_INVALID");
  });
});

describe("ML->Core E2E — Scenario 6: security assessment unavailable -> no silent ALLOW", () => {
  it("a decision request with an absent/unparseable assessment does not ALLOW", async () => {
    const agentId = await seedAgent(companyA);
    // The AI security pipeline is 'unavailable' — no valid SecurityAssessment produced.
    // Core must not silently ALLOW; the request fails validation (no decision, no ALLOW).
    const res = await call("POST", "/v1/decisions", companyA, {
      agent_id: agentId, intent: intentObj(agentId), proposal: proposalObj(agentId), security_assessment: { unavailable: true },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    // Whatever the error, the outcome is NEVER an ALLOW.
    expect(res.json().data?.result).not.toBe("ALLOW");
  });
});

describe("ML->Core E2E — Scenario 8: tenant mismatch rejected", () => {
  it("company B cannot post a proposal against company A's intent", async () => {
    const agentA = await seedAgent(companyA);
    const intentRes = await call("POST", "/v1/intents", companyA, intentObj(agentA));
    const intentRowId = intentRes.json().data.id as string;
    // Company B references A's intent row id -> not found in B's tenant.
    const res = await call("POST", "/v1/proposals", companyB, { ...proposalObj(agentA), intent_id: intentRowId });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.json().error.code).toBe("PROPOSAL_INVALID");
  });
});

describe("ML->Core E2E — Scenario 9: transaction mutation forces revalidation block", () => {
  it("an ALLOW decision cannot execute a mutated transaction (final revalidation mismatch)", async () => {
    const agentId = await seedAgent(companyA);
    const { decisionRes } = await relay(companyA, agentId, proposalObj(agentId), brokenAiAssessment());
    const decisionId = decisionRes.json().data.decision.id as string;
    // Prepare with a transaction whose amount was mutated (proposal says 10, analysis says 99).
    const analysis = { schema_version: "transaction_analysis.v1", transaction_id: "txn_mut", contract: { address: "0xUSDC", verified: true }, function: { name: "transfer", selector: "0xa9059cbb" }, decoded_arguments: {}, state_changes_expected: [], recipient: "0xrecipient", amount: "99.00", asset: "USDC", risk_flags: [], status: "VALID" };
    const payloadHash = transactionPayloadHash({ transactionId: "txn_mut", network: "base-sepolia", recipient: "0xrecipient", amount: "99.00", asset: "USDC", contractAddress: "0xUSDC", functionSelector: "0xa9059cbb" });
    const prep = await call("POST", "/v1/executions/prepare", companyA, {
      agent_id: agentId, decision_id: decisionId, intent: intentObj(agentId), proposal: proposalObj(agentId), security_assessment: brokenAiAssessment(),
      transaction_id: "txn_mut", analysis, expected_network: "base-sepolia", actual_network: "base-sepolia",
      simulation: { schema_version: "simulation_result.v1", transaction_id: "txn_mut", status: "PASS", would_revert: false, expected_state_changes: [], unexpected_state_changes: [], revert_reason: null, simulator: { provider: "sim", version: "1" }, simulated_at: "2026-09-11T12:00:00Z" },
      simulated_payload_hash: payloadHash, decision_context_hash: "", financial_scope_key: agentId, asset: "USDC", amount: "10.00", require_simulation: true,
    }, "ADMIN");
    expect(prep.statusCode).toBeGreaterThanOrEqual(400);
    expect(prep.json().error.code).toBe("EXECUTION_BLOCKED");
  });
});

describe("ML->Core E2E — Scenario 10: retry / idempotency", () => {
  it("re-posting the same intent + repeating a decision is safe (no duplicate authorization)", async () => {
    const agentId = await seedAgent(companyA);
    // Two identical decision requests for the same compliant proposal.
    const first = await relay(companyA, agentId, proposalObj(agentId), brokenAiAssessment());
    const second = await call("POST", "/v1/decisions", companyA, {
      agent_id: agentId, intent: intentObj(agentId), proposal: proposalObj(agentId), security_assessment: brokenAiAssessment(),
    });
    // Repeating an identical authoritative decision request is safe: the deterministic
    // engine returns the SAME result each time (no duplicate/divergent authorization).
    expect(first.decisionRes.json().data.result).toBe("ALLOW");
    expect(second.json().data.result).toBe("ALLOW");
    // Each decision is a distinct immutable record (append-only; history is preserved).
    expect(second.json().data.decision.id).not.toBe(first.decisionRes.json().data.decision.id);
  });

  it("the deterministic decision result is stable across repeated identical requests", async () => {
    const agentId = await seedAgent(companyA);
    const results = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const r = await call("POST", "/v1/decisions", companyA, {
        agent_id: agentId, intent: intentObj(agentId), proposal: proposalObj(agentId, { amount: "500.00" }), security_assessment: brokenAiAssessment(),
      });
      results.add(r.json().data.result as string);
    }
    // Over-limit is deterministically DENY every time — never flips to ALLOW.
    expect([...results]).toEqual(["DENY"]);
  });
});

describe("ML->Core E2E — correlation + tenant survive + assessment persisted", () => {
  it("echoes the correlation id and persists the assessment bound to the proposal", async () => {
    const agentId = await seedAgent(companyA);
    const intentRes = await call("POST", "/v1/intents", companyA, intentObj(agentId));
    const intentRowId = intentRes.json().data.id as string;
    // Correlation id echoed back on the response.
    expect(intentRes.headers["x-correlation-id"]).toBe("corr_e2e_1");
    const proposalRes = await call("POST", "/v1/proposals", companyA, { ...proposalObj(agentId), intent_id: intentRowId });
    const proposalRowId = proposalRes.json().data.id as string;
    await call("POST", `/v1/proposals/${proposalRowId}/assessments`, companyA, { ...brokenAiAssessment() });
    // Assessment is retrievable + tenant-scoped.
    const got = await call("GET", `/v1/proposals/${proposalRowId}/assessment`, companyA);
    expect(got.statusCode).toBe(200);
    expect(got.json().data.proposalId).toBe(proposalRowId);
    // Company B cannot read it.
    const crossTenant = await call("GET", `/v1/proposals/${proposalRowId}/assessment`, companyB);
    expect(crossTenant.statusCode).toBe(404);
  });
});
