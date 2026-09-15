/**
 * Phase 4 — policy lifecycle + immutability tests (Tasks 4.1/4.2/4.13, §16).
 *
 * DB-backed (real Postgres). Verifies the version state machine, activation supersede
 * semantics, and that an ACTIVE/SUPERSEDED version cannot be mutated — a change must be
 * a new version.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, stopCluster, type TestDb } from "../db/harness";
import { PolicyService, type CompiledRule } from "@/policy/index";
import { CompanyService } from "@/domain/index";
import { isCoreError } from "@/shared/errors/index";

let db: TestDb;
let policies: PolicyService;
let companies: CompanyService;
let companyId: string;

const rules: CompiledRule[] = [
  { rule_id: "amt", type: "AMOUNT_LIMIT", config: { maximum: "20.00" } },
  { rule_id: "net", type: "NETWORK_ALLOW", config: { networks: ["base-sepolia"] } },
];

beforeAll(async () => {
  db = await createTestDb();
  policies = new PolicyService(db.prisma);
  companies = new CompanyService(db.prisma);
  companyId = (await companies.createCompany({ name: "Policy Co" })).id;
}, 120_000);

afterAll(async () => {
  await db?.disconnect();
  await stopCluster();
});

async function draftAndActivate(name: string) {
  const { policy, version } = await policies.createDraft({ companyId, name, rules });
  await policies.validate(companyId, version.id);
  await policies.simulate(companyId, version.id);
  await policies.approve(companyId, version.id, "operator_1");
  const active = await policies.activate(companyId, version.id);
  return { policy, version, active };
}

describe("Phase 4 — policy lifecycle", () => {
  it("moves DRAFT -> VALIDATING -> SIMULATED -> APPROVED -> ACTIVE", async () => {
    const { active } = await draftAndActivate("Vendor Policy");
    expect(active.status).toBe("ACTIVE");
    expect(active.version).toBe(1);
  });

  it("rejects an illegal transition (DRAFT -> ACTIVE directly)", async () => {
    const { version } = await policies.createDraft({ companyId, name: "Bad Transition", rules });
    await expect(policies.activate(companyId, version.id)).rejects.toSatisfy(isCoreError);
  });

  it("rejects a malformed compiled rule set at draft time", async () => {
    await expect(
      policies.createDraft({
        companyId,
        name: "Malformed",
        rules: [{ rule_id: "x", type: "NOT_A_RULE" as CompiledRule["type"], config: {} }],
      }),
    ).rejects.toSatisfy(isCoreError);
  });
});

describe("Phase 4 — version immutability + supersede", () => {
  it("activating a new version supersedes the prior active one (exactly one ACTIVE)", async () => {
    const { policy, version: v1 } = await policies.createDraft({ companyId, name: "Immutable Policy", rules });
    await policies.validate(companyId, v1.id);
    await policies.simulate(companyId, v1.id);
    await policies.approve(companyId, v1.id);
    await policies.activate(companyId, v1.id);

    // New version with changed rules.
    const { version: v2 } = await policies.createDraft({
      companyId,
      name: "Immutable Policy",
      rules: [{ rule_id: "amt", type: "AMOUNT_LIMIT", config: { maximum: "50.00" } }],
    });
    expect(v2.version).toBe(2);
    await policies.validate(companyId, v2.id);
    await policies.simulate(companyId, v2.id);
    await policies.approve(companyId, v2.id);
    await policies.activate(companyId, v2.id);

    const active = await policies.getActiveVersion(companyId, policy.id);
    expect(active?.id).toBe(v2.id);

    // v1 is now SUPERSEDED and its rules are unchanged (reconstructable).
    const v1After = await policies.getVersion(companyId, v1.id);
    expect(v1After?.status).toBe("SUPERSEDED");
    const v1Rules = await policies.loadRules(companyId, v1.id);
    expect(v1Rules.find((r) => r.rule_id === "amt")?.config.maximum).toBe("20.00");
  });

  it("refuses to mutate an ACTIVE version (must create a new version)", async () => {
    const { version } = await draftAndActivate("No-Mutate Policy");
    await expect(policies.assertMutableForEdit(companyId, version.id)).rejects.toSatisfy(isCoreError);
  });
});
