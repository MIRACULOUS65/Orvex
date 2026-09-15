/**
 * Phase 3 — Company / Agent / Constitution / Capability domain tests.
 *
 * Runs against a real Postgres schema (Supabase when configured, else embedded). Covers
 * the batch security invariants:
 *   1. every company-scoped object is tenant-bound
 *   3. active Constitution belongs to the same company/agent
 *   5. child capability cannot exceed parent capability
 *   6. agent cannot modify its own authority (no self-authority mutation path)
 *   7. expired/revoked capability cannot authorize future actions
 *   8. historical Constitution versions remain reconstructable
 * plus agent lifecycle, constitution validation/activation, capability expiry/revoke.
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
import { isCoreError } from "@/shared/errors/index";

let db: TestDb;
let companies: CompanyService;
let agents: AgentService;
let constitutions: ConstitutionService;
let capabilities: CapabilityService;

beforeAll(async () => {
  db = await createTestDb();
  companies = new CompanyService(db.prisma);
  agents = new AgentService(db.prisma);
  constitutions = new ConstitutionService(db.prisma);
  capabilities = new CapabilityService(db.prisma);
}, 120_000);

afterAll(async () => {
  await db?.disconnect();
  await stopCluster();
});

const baseConfig: ConstitutionConfig = {
  purpose: "vendor payments",
  allowed_actions: ["PAY"],
  allowed_assets: ["USDC"],
  allowed_networks: ["base-sepolia"],
  allowed_categories: ["API", "CLOUD"],
  spending_limits: { single_transaction: "20.00", daily: "100.00" },
};

async function seedAgent(companyName: string, agentName = "payer") {
  const company = await companies.createCompany({ name: companyName });
  const agent = await agents.createAgent({ companyId: company.id, name: agentName });
  return { company, agent };
}

describe("Phase 3 — company registry + agent lifecycle", () => {
  it("creates a company and rejects a blank name", async () => {
    const c = await companies.createCompany({ name: "Acme Ltd" });
    expect(c.status).toBe("ACTIVE");
    await expect(companies.createCompany({ name: "  " })).rejects.toSatisfy(isCoreError);
  });

  it("runs the full agent lifecycle CREATED -> ACTIVE -> PAUSED -> ACTIVE -> DISABLED", async () => {
    const { company, agent } = await seedAgent("Lifecycle Co");
    expect(agent.status).toBe("CREATED");
    expect((await agents.activateAgent(company.id, agent.id)).status).toBe("ACTIVE");
    expect((await agents.pauseAgent(company.id, agent.id)).status).toBe("PAUSED");
    expect((await agents.resumeAgent(company.id, agent.id)).status).toBe("ACTIVE");
    expect((await agents.suspendAgent(company.id, agent.id)).status).toBe("SUSPENDED");
    expect((await agents.disableAgent(company.id, agent.id)).status).toBe("DISABLED");
  });

  it("rejects a duplicate agent name within a company", async () => {
    const { company } = await seedAgent("Dup Co", "unique-agent");
    await expect(
      agents.createAgent({ companyId: company.id, name: "unique-agent" }),
    ).rejects.toSatisfy(isCoreError);
  });
});

describe("Phase 3 — tenant isolation (invariant 1)", () => {
  it("company A cannot read, update, or reach company B's agent", async () => {
    const { company: a } = await seedAgent("Tenant A");
    const { company: b, agent: bAgent } = await seedAgent("Tenant B");

    // A cannot READ B's agent.
    expect(await agents.getAgent(a.id, bAgent.id)).toBeNull();

    // A cannot UPDATE B's agent (scoped require throws AGENT_NOT_FOUND).
    await expect(agents.pauseAgent(a.id, bAgent.id)).rejects.toSatisfy(isCoreError);

    // A cannot create a constitution for B's agent under A's tenant scope.
    await expect(
      constitutions.createConstitution({ companyId: a.id, agentId: bAgent.id, config: baseConfig }),
    ).rejects.toSatisfy(isCoreError);

    // B's agent is still reachable within B.
    expect(await agents.getAgent(b.id, bAgent.id)).not.toBeNull();
  });

  it("company A cannot read company B's capability", async () => {
    const { company: b, agent: bAgent } = await seedAgent("Tenant B2");
    const { company: a } = await seedAgent("Tenant A2");
    const cap = await capabilities.createCapability({
      companyId: b.id,
      agentId: bAgent.id,
      action: "PAY",
    });
    expect(await capabilities.getCapability(a.id, cap.id)).toBeNull();
    expect(await capabilities.getCapability(b.id, cap.id)).not.toBeNull();
  });
});

describe("Phase 3 — constitution validation, activation, versioning (invariants 3, 8)", () => {
  it("rejects an invalid constitution (float spending limit, no actions)", () => {
    expect(() =>
      constitutions.validateConstitution({
        purpose: "x",
        allowed_actions: [],
      } as ConstitutionConfig),
    ).toThrow();
    expect(() =>
      constitutions.validateConstitution({
        purpose: "x",
        allowed_actions: ["PAY"],
        // @ts-expect-error deliberately wrong type to prove float money is rejected
        spending_limits: { daily: 100.0 },
      }),
    ).toThrow();
  });

  it("activates a constitution, repoints the agent, and keeps exactly one ACTIVE", async () => {
    const { company, agent } = await seedAgent("Const Co");
    const v1 = await constitutions.createConstitution({
      companyId: company.id,
      agentId: agent.id,
      config: baseConfig,
    });
    expect(v1.version).toBe(1);
    const activated = await constitutions.activateConstitution(company.id, v1.id);
    expect(activated.status).toBe("ACTIVE");

    const refreshed = await agents.getAgent(company.id, agent.id);
    expect(refreshed?.activeConstitutionId).toBe(v1.id);

    // New version supersedes the old; still exactly one ACTIVE.
    const v2 = await constitutions.createConstitution({
      companyId: company.id,
      agentId: agent.id,
      config: { ...baseConfig, spending_limits: { single_transaction: "30.00", daily: "150.00" } },
    });
    expect(v2.version).toBe(2);
    await constitutions.activateConstitution(company.id, v2.id);

    const active = await constitutions.getActiveConstitution(company.id, agent.id);
    expect(active?.id).toBe(v2.id);

    // Historical v1 remains reconstructable and unchanged (invariant 8).
    const historical = await constitutions.getConstitutionVersion(company.id, agent.id, 1);
    expect(historical?.status).toBe("SUPERSEDED");
    const cfg = historical?.configurationJson as unknown as ConstitutionConfig;
    expect(cfg.spending_limits?.daily).toBe("100.00");
  });
});

describe("Phase 3 — capability ⊆ constitution + expiry/revocation (invariant 7)", () => {
  it("rejects a capability that exceeds the constitution's allowed action/limit", async () => {
    const { company, agent } = await seedAgent("Cap Const Co");
    const v1 = await constitutions.createConstitution({
      companyId: company.id,
      agentId: agent.id,
      config: baseConfig,
    });
    await constitutions.activateConstitution(company.id, v1.id);

    // Action not allowed by constitution.
    await expect(
      capabilities.createCapability({ companyId: company.id, agentId: agent.id, action: "SWAP" }),
    ).rejects.toSatisfy(isCoreError);

    // Single-tx limit above constitution's single_transaction (20.00).
    await expect(
      capabilities.createCapability({
        companyId: company.id,
        agentId: agent.id,
        action: "PAY",
        singleTransactionLimit: "50.00",
      }),
    ).rejects.toSatisfy(isCoreError);

    // Within constitution -> allowed.
    const ok = await capabilities.createCapability({
      companyId: company.id,
      agentId: agent.id,
      action: "PAY",
      asset: "USDC",
      network: "base-sepolia",
      singleTransactionLimit: "10.00",
    });
    expect(ok.status).toBe("ACTIVE");
  });

  it("expired capability cannot authorize (validate throws CAPABILITY_EXPIRED)", async () => {
    const { company, agent } = await seedAgent("Expiry Co");
    const past = new Date(Date.now() - 60_000);
    const cap = await capabilities.createCapability({
      companyId: company.id,
      agentId: agent.id,
      action: "PAY",
      expiresAt: past,
    });
    await expect(capabilities.validateCapability(company.id, cap.id)).rejects.toSatisfy(isCoreError);

    // getActiveCapabilities excludes it.
    const active = await capabilities.getActiveCapabilities(company.id, agent.id);
    expect(active.find((c) => c.id === cap.id)).toBeUndefined();

    // expireCapabilities marks it EXPIRED.
    const n = await capabilities.expireCapabilities(company.id);
    expect(n).toBeGreaterThanOrEqual(1);
  });

  it("revoked capability cannot authorize and cascades to children", async () => {
    const { company, agent } = await seedAgent("Revoke Co");
    const parent = await capabilities.createCapability({
      companyId: company.id,
      agentId: agent.id,
      action: "PAY",
      dailyLimit: "100.00",
    });
    const child = await capabilities.createCapability({
      companyId: company.id,
      agentId: agent.id,
      action: "PAY",
      dailyLimit: "40.00",
      parentCapabilityId: parent.id,
    });
    await capabilities.revokeCapability(company.id, parent.id);

    await expect(capabilities.validateCapability(company.id, parent.id)).rejects.toSatisfy(isCoreError);
    const revokedChild = await capabilities.getCapability(company.id, child.id);
    expect(revokedChild?.status).toBe("REVOKED");
  });
});

describe("Phase 3 — delegated capability cannot exceed parent (invariant 5)", () => {
  it("rejects a child that expands amount, asset, network, scope, or time", async () => {
    const { company, agent } = await seedAgent("Delegation Co");
    const parent = await capabilities.createCapability({
      companyId: company.id,
      agentId: agent.id,
      action: "PAY",
      asset: "USDC",
      network: "base-sepolia",
      categoryScope: ["API", "CLOUD"],
      dailyLimit: "100.00",
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    // Amount expansion.
    await expect(
      capabilities.createCapability({
        companyId: company.id,
        agentId: agent.id,
        action: "PAY",
        dailyLimit: "200.00",
        parentCapabilityId: parent.id,
      }),
    ).rejects.toSatisfy(isCoreError);

    // Category scope expansion (DATA not in parent).
    await expect(
      capabilities.createCapability({
        companyId: company.id,
        agentId: agent.id,
        action: "PAY",
        categoryScope: ["API", "DATA"],
        dailyLimit: "50.00",
        parentCapabilityId: parent.id,
      }),
    ).rejects.toSatisfy(isCoreError);

    // Time expansion (child outlives parent).
    await expect(
      capabilities.createCapability({
        companyId: company.id,
        agentId: agent.id,
        action: "PAY",
        dailyLimit: "50.00",
        expiresAt: new Date(Date.now() + 7_200_000),
        parentCapabilityId: parent.id,
      }),
    ).rejects.toSatisfy(isCoreError);

    // A properly contained child is accepted.
    const child = await capabilities.createCapability({
      companyId: company.id,
      agentId: agent.id,
      action: "PAY",
      asset: "USDC",
      network: "base-sepolia",
      categoryScope: ["API"],
      dailyLimit: "40.00",
      expiresAt: new Date(Date.now() + 1_800_000),
      parentCapabilityId: parent.id,
    });
    expect(child.parentCapabilityId).toBe(parent.id);
  });
});

describe("Phase 3 — agent cannot modify its own authority (invariant 6)", () => {
  it("exposes no agent-principal path to change its own constitution/capabilities", () => {
    // The AgentService surface is operator lifecycle only; it has no method that lets an
    // agent alter its own authority. Authority changes live in Constitution/Capability
    // services which require an operator-supplied companyId scope, not an agent identity.
    const surface = Object.getOwnPropertyNames(AgentService.prototype);
    for (const forbidden of ["setConstitution", "grantCapability", "elevate", "setPolicy"]) {
      expect(surface).not.toContain(forbidden);
    }
  });
});
