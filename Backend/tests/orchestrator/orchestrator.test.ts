/**
 * Phase 8 — Security Orchestrator tests (Tasks 8.1-8.8).
 *
 * DB-backed against real Postgres. Verifies deterministic context assembly and
 * fail-closed behavior: missing/inactive agent, missing active policy, expired
 * capability, stale SecurityAssessment, tenant mismatch, and that the orchestrator
 * produces a decision CONTEXT (never an authorization) with the AI assessment marked
 * non-authoritative. Determinism is checked by re-running with identical inputs.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, stopCluster, type TestDb } from "../db/harness";
import {
  AgentService,
  CapabilityService,
  CompanyService,
  ConstitutionService,
  type ConstitutionConfig,
} from "@/domain/index";
import { PolicyService, type CompiledRule } from "@/policy/index";
import { SecurityOrchestrator } from "@/application/orchestrator/index";
import {
  MockSimulationProvider,
  MockTransactionAnalysisProvider,
} from "@/application/clients/execution/types";
import { ActionProposal, Intent, SecurityAssessment } from "@/shared/contracts/index";
import { isCoreError } from "@/shared/errors/index";

let db: TestDb;
let companies: CompanyService;
let agents: AgentService;
let constitutions: ConstitutionService;
let capabilities: CapabilityService;
let policies: PolicyService;
let orchestrator: SecurityOrchestrator;

const NOW = new Date("2026-09-11T12:00:00Z");

const constitutionConfig: ConstitutionConfig = {
  purpose: "vendor payments",
  allowed_actions: ["PAY"],
  allowed_assets: ["USDC"],
  allowed_networks: ["base-sepolia"],
  allowed_categories: ["API"],
  spending_limits: { single_transaction: "20.00", daily: "100.00" },
};

const policyRules: CompiledRule[] = [
  { rule_id: "amt", type: "AMOUNT_LIMIT", config: { maximum: "20.00" } },
  { rule_id: "net", type: "NETWORK_ALLOW", config: { networks: ["base-sepolia"] } },
];

beforeAll(async () => {
  db = await createTestDb();
  companies = new CompanyService(db.prisma);
  agents = new AgentService(db.prisma);
  constitutions = new ConstitutionService(db.prisma);
  capabilities = new CapabilityService(db.prisma);
  policies = new PolicyService(db.prisma);
  orchestrator = new SecurityOrchestrator({
    db: db.prisma,
    policyService: policies,
    transactionAnalysis: new MockTransactionAnalysisProvider(),
    simulation: new MockSimulationProvider(),
  });
}, 120_000);

afterAll(async () => {
  await db?.disconnect();
  await stopCluster();
});

/** Build a fully-configured, ACTIVE agent with active constitution + capability + policy. */
async function seedFullAgent(name: string, opts: { capExpiresAt?: Date | null } = {}) {
  const company = await companies.createCompany({ name });
  const agent = await agents.createAgent({ companyId: company.id, name: "payer" });
  await agents.activateAgent(company.id, agent.id);

  const c = await constitutions.createConstitution({
    companyId: company.id,
    agentId: agent.id,
    config: constitutionConfig,
  });
  await constitutions.activateConstitution(company.id, c.id);

  await capabilities.createCapability({
    companyId: company.id,
    agentId: agent.id,
    action: "PAY",
    asset: "USDC",
    network: "base-sepolia",
    singleTransactionLimit: "20.00",
    // validFrom must precede the fixed test NOW (2026-09-11T12:00:00Z).
    validFrom: new Date("2026-09-11T00:00:00Z"),
    expiresAt: opts.capExpiresAt === undefined ? new Date("2026-12-31T00:00:00Z") : opts.capExpiresAt,
  });

  const { policy, version } = await policies.createDraft({
    companyId: company.id,
    agentId: agent.id,
    name: "vendor-policy",
    rules: policyRules,
  });
  await policies.validate(company.id, version.id);
  await policies.simulate(company.id, version.id);
  await policies.approve(company.id, version.id);
  await policies.activate(company.id, version.id);
  await db.prisma.agent.update({ where: { id: agent.id }, data: { activePolicyId: policy.id } });

  return { companyId: company.id, agentId: agent.id };
}

function makeIntent(agentId: string) {
  return Intent.parse({
    intent_id: "intent_1",
    agent_id: agentId,
    user_goal: "pay api",
    purpose: "renew",
    desired_outcome: "renewed",
    valid_from: "2026-09-11T00:00:00Z",
    valid_until: "2026-09-30T00:00:00Z",
    created_at: "2026-09-11T00:00:00Z",
  });
}

function makeProposal(agentId: string, overrides: Record<string, unknown> = {}) {
  return ActionProposal.parse({
    proposal_id: "proposal_1",
    intent_id: "intent_1",
    agent_id: agentId,
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

describe("Phase 8 — decision context assembly", () => {
  it("assembles a full, internally-consistent context (compliant tx -> policy PASS)", async () => {
    const { companyId, agentId } = await seedFullAgent("Orchestrate OK");
    const ctx = await orchestrator.orchestrate({
      companyId,
      agentId,
      intent: makeIntent(agentId),
      proposal: makeProposal(agentId),
      securityAssessment: makeAssessment(),
      requireSimulation: true,
      now: NOW,
    });
    expect(ctx.policyEvaluation.status).toBe("PASS");
    expect(ctx.capabilityId).toBeTruthy();
    expect(ctx.policyVersionId).toBeTruthy();
    expect(ctx.transactionAnalysis).toBeTruthy();
    expect(ctx.simulationResult).toBeTruthy();
    // AI advisory is carried but explicitly non-authoritative.
    expect(ctx.securityAdvisory.isAuthoritative).toBe(false);
  });

  it("reflects a deterministic policy FAILURE for an over-limit proposal (no authority leak)", async () => {
    const { companyId, agentId } = await seedFullAgent("Orchestrate OverLimit");
    const ctx = await orchestrator.orchestrate({
      companyId,
      agentId,
      intent: makeIntent(agentId),
      proposal: makeProposal(agentId, { amount: { value: "500.00", currency: "USDC" } }),
      // AI says everything is fine — must not override policy.
      securityAssessment: makeAssessment(),
      now: NOW,
    });
    expect(ctx.policyEvaluation.status).toBe("FAIL");
  });

  it("is deterministic: identical inputs produce the same policy evaluation hash", async () => {
    const { companyId, agentId } = await seedFullAgent("Orchestrate Deterministic");
    const args = {
      companyId,
      agentId,
      intent: makeIntent(agentId),
      proposal: makeProposal(agentId),
      securityAssessment: makeAssessment(),
      now: NOW,
    };
    const a = await orchestrator.orchestrate(args);
    const b = await orchestrator.orchestrate(args);
    expect(a.policyEvaluation.evaluation_hash).toBe(b.policyEvaluation.evaluation_hash);
  });
});

describe("Phase 8 — fail-closed behavior", () => {
  it("fails when the agent is not ACTIVE", async () => {
    const { companyId, agentId } = await seedFullAgent("Orchestrate Inactive");
    await agents.pauseAgent(companyId, agentId);
    await expect(
      orchestrator.orchestrate({
        companyId,
        agentId,
        intent: makeIntent(agentId),
        proposal: makeProposal(agentId),
        securityAssessment: makeAssessment(),
        now: NOW,
      }),
    ).rejects.toSatisfy(isCoreError);
  });

  it("fails when there is no active policy", async () => {
    const company = await companies.createCompany({ name: "Orchestrate NoPolicy" });
    const agent = await agents.createAgent({ companyId: company.id, name: "payer" });
    await agents.activateAgent(company.id, agent.id);
    const c = await constitutions.createConstitution({ companyId: company.id, agentId: agent.id, config: constitutionConfig });
    await constitutions.activateConstitution(company.id, c.id);
    await capabilities.createCapability({ companyId: company.id, agentId: agent.id, action: "PAY", asset: "USDC", network: "base-sepolia", validFrom: new Date("2026-09-11T00:00:00Z") });
    // No policy activated / no activePolicyId.
    await expect(
      orchestrator.orchestrate({
        companyId: company.id,
        agentId: agent.id,
        intent: makeIntent(agent.id),
        proposal: makeProposal(agent.id),
        securityAssessment: makeAssessment(),
        now: NOW,
      }),
    ).rejects.toSatisfy(isCoreError);
  });

  it("fails when the only capability is expired", async () => {
    const { companyId, agentId } = await seedFullAgent("Orchestrate ExpiredCap", {
      capExpiresAt: new Date("2026-09-11T11:00:00Z"), // before NOW
    });
    await expect(
      orchestrator.orchestrate({
        companyId,
        agentId,
        intent: makeIntent(agentId),
        proposal: makeProposal(agentId),
        securityAssessment: makeAssessment(),
        now: NOW,
      }),
    ).rejects.toSatisfy(isCoreError);
  });

  it("fails on a stale SecurityAssessment (too old)", async () => {
    const { companyId, agentId } = await seedFullAgent("Orchestrate Stale");
    await expect(
      orchestrator.orchestrate({
        companyId,
        agentId,
        intent: makeIntent(agentId),
        proposal: makeProposal(agentId),
        securityAssessment: makeAssessment({ created_at: "2026-09-11T11:00:00Z" }),
        assessmentMaxAgeMs: 60_000, // 1 min; assessment is 1h old
        now: NOW,
      }),
    ).rejects.toSatisfy(isCoreError);
  });

  it("fails on assessment bound to a different proposal (tenant/binding mismatch)", async () => {
    const { companyId, agentId } = await seedFullAgent("Orchestrate WrongProposal");
    await expect(
      orchestrator.orchestrate({
        companyId,
        agentId,
        intent: makeIntent(agentId),
        proposal: makeProposal(agentId),
        securityAssessment: makeAssessment({ proposal_id: "proposal_OTHER" }),
        now: NOW,
      }),
    ).rejects.toSatisfy(isCoreError);
  });
});
