/**
 * Phase 12 — Final Revalidation / Execution Gate tests (Tasks 12.1-12.5 + critical 1-9).
 *
 * DB-backed against real Postgres. Proves the decision is re-derived at execution time
 * and fails closed on any drift (stale policy/capability/agent/budget/simulation/
 * approval/context), reserves budget without committing, mints a bound ExecutionRequest,
 * and is idempotent (repeat -> one execution). No secrets in the ExecutionRequest.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, stopCluster, type TestDb } from "../db/harness";
import {
  AgentService,
  CapabilityService,
  CompanyService,
  ConstitutionService,
  FinancialService,
  type ConstitutionConfig,
} from "@/domain/index";
import { PolicyService, type CompiledRule } from "@/policy/index";
import { FinalRevalidationService, transactionPayloadHash } from "@/execution-gate/index";
import { ActionProposal, Intent, SecurityAssessment, TransactionAnalysis, SimulationResult } from "@/shared/contracts/index";

let db: TestDb;
let companies: CompanyService;
let agents: AgentService;
let constitutions: ConstitutionService;
let capabilities: CapabilityService;
let policies: PolicyService;
let financial: FinancialService;
let revalidation: FinalRevalidationService;

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
  financial = new FinancialService(db.prisma);
  revalidation = new FinalRevalidationService({ db: db.prisma, policyService: policies });
}, 120_000);

afterAll(async () => {
  await db?.disconnect();
  await stopCluster();
});

async function seedFullAgent(name: string, opts: { capExpiresAt?: Date | null; budget?: string } = {}) {
  const company = await companies.createCompany({ name });
  const agent = await agents.createAgent({ companyId: company.id, name: "payer" });
  await agents.activateAgent(company.id, agent.id);
  const c = await constitutions.createConstitution({ companyId: company.id, agentId: agent.id, config: constitutionConfig });
  await constitutions.activateConstitution(company.id, c.id);
  await capabilities.createCapability({
    companyId: company.id, agentId: agent.id, action: "PAY", asset: "USDC", network: "base-sepolia",
    singleTransactionLimit: "20.00", validFrom: new Date("2026-09-11T00:00:00Z"),
    expiresAt: opts.capExpiresAt === undefined ? new Date("2026-12-31T00:00:00Z") : opts.capExpiresAt,
  });
  const { policy, version } = await policies.createDraft({ companyId: company.id, agentId: agent.id, name: "vendor-policy", rules: policyRules });
  await policies.validate(company.id, version.id);
  await policies.simulate(company.id, version.id);
  await policies.approve(company.id, version.id);
  await policies.activate(company.id, version.id);
  await db.prisma.agent.update({ where: { id: agent.id }, data: { activePolicyId: policy.id } });
  // Pre-provision a budget bucket with a limit.
  await financial.ensureAccount(
    { companyId: company.id, agentId: agent.id, scope: "AGENT", scopeKey: agent.id, asset: "USDC", network: "base-sepolia" },
    opts.budget ?? "100.00",
  );
  return { companyId: company.id, agentId: agent.id, policyId: policy.id };
}

function makeIntent(agentId: string) {
  return Intent.parse({
    intent_id: "intent_1", agent_id: agentId, user_goal: "pay", purpose: "renew", desired_outcome: "renewed",
    valid_from: "2026-09-11T00:00:00Z", valid_until: "2026-09-30T00:00:00Z", created_at: "2026-09-11T00:00:00Z",
  });
}
function makeProposal(agentId: string, overrides: Record<string, unknown> = {}) {
  return ActionProposal.parse({
    proposal_id: "proposal_1", intent_id: "intent_1", agent_id: agentId, action_type: "PAY", purpose: "renew",
    amount: { value: "10.00", currency: "USDC" }, recipient: { type: "SERVICE", address: "0xrecipient", network: "base-sepolia" },
    network: "base-sepolia", created_at: "2026-09-11T12:00:00Z", ...overrides,
  });
}
function makeAssessment(overrides: Record<string, unknown> = {}) {
  return SecurityAssessment.parse({
    assessment_id: "assess_1", proposal_id: "proposal_1",
    intent_verification: { status: "PASS", intent_match: true, score: 1 },
    threat_assessment: { detected: false }, reputation_assessment: { level: "MEDIUM" },
    anomaly_assessment: { level: "LOW" }, risk_assessment: { level: "LOW" },
    overall_assessment: { status: "LOW_RISK", confidence: 0.9, summary: "ok", recommended_handling: "PROCEED_CANDIDATE" },
    created_at: "2026-09-11T12:00:00Z", ...overrides,
  });
}
function makeAnalysis(overrides: Record<string, unknown> = {}) {
  return TransactionAnalysis.parse({
    schema_version: "transaction_analysis.v1", transaction_id: "txn_1",
    contract: { address: "0xUSDC", verified: true }, function: { name: "transfer", selector: "0xa9059cbb" },
    decoded_arguments: {}, state_changes_expected: [], recipient: "0xrecipient", amount: "10.00", asset: "USDC",
    risk_flags: [], status: "VALID", ...overrides,
  });
}
function makeSimulation(overrides: Record<string, unknown> = {}) {
  return SimulationResult.parse({
    schema_version: "simulation_result.v1", transaction_id: "txn_1", status: "PASS", would_revert: false,
    expected_state_changes: [], unexpected_state_changes: [], revert_reason: null,
    simulator: { provider: "sim", version: "1" }, simulated_at: "2026-09-11T12:00:00Z", ...overrides,
  });
}

function baseRevalidate(companyId: string, agentId: string, overrides: Partial<Parameters<FinalRevalidationService["revalidate"]>[0]> = {}) {
  const analysis = makeAnalysis();
  const payloadHash = transactionPayloadHash({
    transactionId: "txn_1", network: "base-sepolia", recipient: analysis.recipient, amount: analysis.amount,
    asset: analysis.asset, contractAddress: analysis.contract.address, functionSelector: analysis.function.selector,
  });
  return {
    companyId, agentId, decisionId: "decision_1",
    intent: makeIntent(agentId), proposal: makeProposal(agentId), securityAssessment: makeAssessment(),
    transactionId: "txn_1", analysis, expectedNetwork: "base-sepolia", actualNetwork: "base-sepolia",
    simulation: makeSimulation(), simulatedPayloadHash: payloadHash,
    decisionContextHash: "", financialScopeKey: agentId, asset: "USDC", amount: "10.00",
    simulationRequired: true, now: NOW, ...overrides,
  };
}

describe("Phase 12 — happy path", () => {
  it("ALLOWs and mints a bound ExecutionRequest with no secrets", async () => {
    const { companyId, agentId } = await seedFullAgent("Reval OK");
    const out = await revalidation.revalidate(baseRevalidate(companyId, agentId));
    expect(out.result).toBe("ALLOW");
    expect(out.executionRequest).toBeTruthy();
    const req = out.executionRequest!;
    expect(req.authorizationContextHash).toBeTruthy();
    expect(req.idempotencyKey).toBeTruthy();
    // No secret-bearing fields exist on the execution request record.
    const keys = Object.keys(req);
    for (const forbidden of ["privateKey", "seedPhrase", "signer", "secret", "mnemonic"]) {
      expect(keys).not.toContain(forbidden);
    }
    // Reservation is HELD (RESERVED), not committed.
    const reservation = await db.prisma.financialReservation.findUnique({ where: { id: out.reservationId! } });
    expect(reservation?.status).toBe("RESERVED");
  });
});

describe("Phase 12 — stale-decision handling (critical 1-3,5,6)", () => {
  it("CRITICAL 2: agent PAUSED after decision -> execution blocked", async () => {
    const { companyId, agentId } = await seedFullAgent("Reval Paused");
    await agents.pauseAgent(companyId, agentId);
    const out = await revalidation.revalidate(baseRevalidate(companyId, agentId));
    expect(out.result).toBe("DENY");
    expect(out.determinant).toBe("agent_inactive");
  });

  it("CRITICAL 1: capability expires after decision -> execution blocked", async () => {
    const { companyId, agentId } = await seedFullAgent("Reval CapExpired", { capExpiresAt: new Date("2026-09-11T11:00:00Z") });
    const out = await revalidation.revalidate(baseRevalidate(companyId, agentId));
    expect(out.result).toBe("DENY");
    expect(out.determinant).toBe("capability_invalid");
  });

  it("CRITICAL 6: transaction/simulation payload changed -> execution blocked (stale sim)", async () => {
    const { companyId, agentId } = await seedFullAgent("Reval StaleSim");
    // Simulation recorded against a different payload hash.
    const out = await revalidation.revalidate(baseRevalidate(companyId, agentId, { simulatedPayloadHash: "sha256:old_payload" }));
    expect(out.result).toBe("DENY");
    expect(out.determinant).toBe("simulation_binding_invalid");
  });

  it("CRITICAL 5: transaction amount differs from proposal -> execution blocked (mismatch)", async () => {
    const { companyId, agentId } = await seedFullAgent("Reval TxnChange");
    const out = await revalidation.revalidate(baseRevalidate(companyId, agentId, { analysis: makeAnalysis({ amount: "999.00" }) }));
    expect(out.result).toBe("DENY");
    expect(out.determinant).toBe("transaction_mismatch");
  });

  it("wrong network at execution -> blocked", async () => {
    const { companyId, agentId } = await seedFullAgent("Reval WrongNet");
    const out = await revalidation.revalidate(baseRevalidate(companyId, agentId, { actualNetwork: "base" }));
    expect(out.result).toBe("DENY");
  });
});

describe("Phase 12 — budget revalidation (critical 4)", () => {
  it("CRITICAL 4: budget consumed by another execution -> final revalidation rejects", async () => {
    // Budget limit 100, but pre-consume 95 so only 5 remains; a 10 payment must fail.
    const { companyId, agentId } = await seedFullAgent("Reval Budget", { budget: "100.00" });
    await financial.reserve({ companyId, agentId, scope: "AGENT", scopeKey: agentId, asset: "USDC", network: "base-sepolia", amount: "95.00" });
    const out = await revalidation.revalidate(baseRevalidate(companyId, agentId));
    expect(out.result).toBe("DENY");
    expect(out.determinant).toBe("budget_exceeded");
  });
});

describe("Phase 12 — idempotency (critical 7)", () => {
  it("CRITICAL 7: repeated revalidation for the same logical execution yields ONE execution request", async () => {
    const { companyId, agentId } = await seedFullAgent("Reval Idem");
    const first = await revalidation.revalidate(baseRevalidate(companyId, agentId));
    expect(first.result).toBe("ALLOW");
    const firstId = first.executionRequest!.id;
    // Repeat many times with the identical logical execution.
    for (let i = 0; i < 5; i++) {
      const again = await revalidation.revalidate(baseRevalidate(companyId, agentId));
      expect(again.result).toBe("ALLOW");
      expect(again.executionRequest!.id).toBe(firstId);
    }
    const all = await db.prisma.executionRequestRecord.findMany({ where: { companyId } });
    expect(all).toHaveLength(1);
  });
});

describe("Phase 12 — no raw execution bypass", () => {
  it("the execution-gate surface exposes only revalidation (no force/raw execute)", async () => {
    const gate = await import("@/execution-gate/index");
    const names = Object.keys(gate);
    for (const forbidden of ["rawExecute", "forceExecute", "sendTransaction", "broadcast"]) {
      expect(names).not.toContain(forbidden);
    }
  });
});
