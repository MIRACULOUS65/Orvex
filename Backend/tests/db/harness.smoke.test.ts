/**
 * Harness smoke test — proves the embedded Postgres boots, the migration applies, and
 * the generated tables/enums/constraints exist. This is the foundation every Phase 3-5
 * database test relies on, so it is verified in isolation first.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, stopCluster, type TestDb } from "./harness";

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

afterAll(async () => {
  await db?.disconnect();
  await stopCluster();
});

describe("Phase 3 — Postgres migration harness", () => {
  it("creates the Phase 3 tables", async () => {
    const rows = await db.prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() ORDER BY table_name`,
    );
    const names = rows.map((r) => r.table_name);
    expect(names).toContain("companies");
    expect(names).toContain("agents");
    expect(names).toContain("constitutions");
    expect(names).toContain("capabilities");
  });

  it("enforces the agents (company_id, name) unique constraint via a real insert path", async () => {
    const company = await db.prisma.company.create({ data: { name: "Acme" } });
    await db.prisma.agent.create({ data: { companyId: company.id, name: "payer" } });
    await expect(
      db.prisma.agent.create({ data: { companyId: company.id, name: "payer" } }),
    ).rejects.toThrow();
  });

  it("stores money as exact Decimal (no float drift)", async () => {
    const company = await db.prisma.company.create({ data: { name: "DecimalCo" } });
    const agent = await db.prisma.agent.create({ data: { companyId: company.id, name: "a1" } });
    const cap = await db.prisma.capability.create({
      data: {
        companyId: company.id,
        agentId: agent.id,
        action: "PAY",
        dailyLimit: "100.10",
      },
    });
    expect(cap.dailyLimit?.toString()).toBe("100.1");
  });
});
