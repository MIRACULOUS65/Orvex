/**
 * Test Core server for the live ML<->Core round-trip.
 *
 * Boots the REAL Core Fastify app (buildApp) against an isolated Postgres schema so the
 * live integration test hits the genuine Core HTTP surface + deterministic services +
 * MockExecutionClient. Not for production — a scripted harness only.
 *
 * Usage: node scripts/serve-test-core.mjs <port> <schema>
 * On ready it prints a line: "CORE_READY <port>".
 */
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const MIGRATIONS_DIR = join(repoRoot, "prisma", "migrations");

const port = Number(process.argv[2] ?? 8098);
const schema = process.argv[3] ?? `live_${randomUUID().replace(/-/gu, "")}`;

function loadMigrations() {
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const parts = [];
  for (const d of dirs) {
    const f = join(MIGRATIONS_DIR, d, "migration.sql");
    if (existsSync(f)) parts.push(readFileSync(f, "utf8"));
  }
  // Strip the CREATE SCHEMA public lines; we apply into an isolated schema.
  return parts.join("\n\n").split("\n").filter((l) => !/CREATE SCHEMA IF NOT EXISTS "public"/u.test(l)).join("\n");
}

/**
 * Seed a fully-configured active agent so the live driver can go straight to the
 * intent->proposal->assessment->decision round-trip. Uses the built domain services.
 */
async function seedCompanyAgent(prisma) {
  const { CompanyService, AgentService, ConstitutionService, CapabilityService } = await import("../dist/domain/index.js");
  const { PolicyService } = await import("../dist/policy/index.js");

  const companies = new CompanyService(prisma);
  const agents = new AgentService(prisma);
  const constitutions = new ConstitutionService(prisma);
  const capabilities = new CapabilityService(prisma);
  const policies = new PolicyService(prisma);

  const company = await companies.createCompany({ name: "Live Roundtrip Co" });
  const agent = await agents.createAgent({ companyId: company.id, name: "live-payer" });
  await agents.activateAgent(company.id, agent.id);

  const constitution = await constitutions.createConstitution({
    companyId: company.id,
    agentId: agent.id,
    config: {
      purpose: "vendor payments",
      allowed_actions: ["PAY"],
      allowed_assets: ["USDC"],
      allowed_networks: ["base-sepolia"],
      allowed_categories: ["API"],
      spending_limits: { single_transaction: "20.00", daily: "100.00" },
    },
  });
  await constitutions.activateConstitution(company.id, constitution.id);

  const { policy, version } = await policies.createDraft({
    companyId: company.id,
    agentId: agent.id,
    name: "live-vendor-policy",
    rules: [
      { rule_id: "amt", type: "AMOUNT_LIMIT", config: { maximum: "20.00" } },
      { rule_id: "net", type: "NETWORK_ALLOW", config: { networks: ["base-sepolia"] } },
    ],
  });
  await policies.validate(company.id, version.id);
  await policies.simulate(company.id, version.id);
  await policies.approve(company.id, version.id);
  await policies.activate(company.id, version.id);
  await prisma.agent.update({ where: { id: agent.id }, data: { activePolicyId: policy.id } });

  await capabilities.createCapability({
    companyId: company.id,
    agentId: agent.id,
    action: "PAY",
    asset: "USDC",
    network: "base-sepolia",
    singleTransactionLimit: "20.00",
    validFrom: new Date("2026-09-11T00:00:00Z"),
    expiresAt: new Date("2026-12-31T00:00:00Z"),
  });
  await prisma.financialAccount.create({
    data: { companyId: company.id, agentId: agent.id, scope: "AGENT", scopeKey: agent.id, asset: "USDC", network: "base-sepolia", limitAmount: "100.00" },
  });

  return { companyId: company.id, agentId: agent.id };
}

async function main() {
  const baseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!baseUrl) throw new Error("DATABASE_URL required for the live Core test server.");

  // Create + migrate an isolated schema.
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.query(`SET search_path TO "${schema}"`);
  await admin.query(loadMigrations());
  await admin.end();

  const url = new URL(baseUrl);
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  process.env.CORE_ENV = "test";

  // Import AFTER DATABASE_URL is set so Prisma binds to the isolated schema.
  const { buildApp } = await import("../dist/api/app.js");
  const { getPrisma } = await import("../dist/repositories/prisma.js");
  const app = await buildApp();

  // Seed a fully-configured, active company/agent (constitution + capability + active
  // policy + budget) so the live driver only performs the HTTP round-trip. This uses
  // the real domain services through the shared client bound to the isolated schema.
  const seeded = await seedCompanyAgent(getPrisma());

  await app.listen({ host: "127.0.0.1", port });

  // Signal readiness + the seeded ids to the driver.
  process.stdout.write(`CORE_READY ${port} ${schema} ${seeded.companyId} ${seeded.agentId}\n`);

  const shutdown = async () => {
    try {
      await app.close();
      const cleanup = new pg.Client({ connectionString: baseUrl });
      await cleanup.connect();
      await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await cleanup.end();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  process.stderr.write(`CORE_FAILED ${err?.message ?? err}\n`);
  process.exit(1);
});
