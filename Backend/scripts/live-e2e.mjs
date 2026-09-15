/**
 * FIRST LIVE END-TO-END: real ML-shaped request -> real Core (real Supabase, isolated
 * schema) -> real authorization (decision + final revalidation) -> real
 * BaseSepoliaExecutionClient -> REAL on-chain 1 USDC transfer on Base Sepolia -> verify ->
 * Core financial commit on the real receipt.
 *
 * Persistence uses the harness's isolated remote schema (test_<uuid>) inside the real
 * Supabase project, so the project's `public` data is never touched. Everything else —
 * AI-shaped inputs, Core authorization logic, the payment, the on-chain proof — is real.
 *
 * The signer key is read only inside the blockchain package from env; never logged here.
 * Run from Backend/ with tsx-less node by importing built Core (dist) + built blockchain
 * (dist). Requires: DATABASE_URL (pooler), BASE_SEPOLIA_RPC_URL, EXECUTION_SIGNER_PRIVATE_KEY.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../dist/api/app.js";
import { buildContainer } from "../dist/api/http/container.js";
import { setConfigForTests, getConfig } from "../dist/config/index.js";
import { transactionPayloadHash } from "../dist/execution-gate/index.js";
import { buildBaseSepoliaExecutionClient } from "../../Blockchain/dist/index.js";

const __here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__here, "..", "prisma", "migrations");

function loadMigrationSql() {
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
  return dirs
    .map(d => join(MIGRATIONS_DIR, d, "migration.sql"))
    .filter(existsSync)
    .map(f => readFileSync(f, "utf8"))
    .join("\n\n");
}

/** Remote: isolated schema in the real Supabase project (never touches public). */
async function createRemoteTestDb(baseUrl) {
  const schema = `live_${randomUUID().replace(/-/gu, "")}`;
  const migration = loadMigrationSql()
    .split("\n").filter(l => !/CREATE SCHEMA IF NOT EXISTS "public"/u.test(l)).join("\n");

  const admin = new pg.Client({ connectionString: baseUrl, connectionTimeoutMillis: 12000 });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.query(`SET search_path TO "${schema}"`);
  await admin.query(migration);
  await admin.end();

  const u = new URL(baseUrl);
  u.searchParams.set("schema", schema);
  const prisma = new PrismaClient({ datasources: { db: { url: u.toString() } } });
  await prisma.$connect();
  return {
    prisma, label: `remote:${schema}`,
    disconnect: async () => {
      await prisma.$disconnect();
      const c = new pg.Client({ connectionString: baseUrl, connectionTimeoutMillis: 12000 });
      await c.connect(); await c.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await c.end();
    },
  };
}

/** Local embedded Postgres — no network. Used when the remote DB is unreachable. */
async function createEmbeddedTestDb() {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const databaseDir = mkdtempSync(join(tmpdir(), "orvex-live-pg-"));
  const port = 55000 + Math.floor(Math.random() * 5000);
  const pgi = new EmbeddedPostgres({
    databaseDir, port, user: "postgres", password: "postgres",
    authMethod: "password", persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {}, onError: () => {},
  });
  await pgi.initialise();
  await pgi.start();
  const dbName = `t_${randomUUID().replace(/-/gu, "")}`;
  const base = (d) => `postgresql://postgres:postgres@127.0.0.1:${port}/${d}?schema=public`;

  const admin = new pg.Client({ connectionString: base("postgres") });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const migrator = new pg.Client({ connectionString: base(dbName) });
  await migrator.connect();
  await migrator.query(loadMigrationSql());
  await migrator.end();

  const prisma = new PrismaClient({ datasources: { db: { url: base(dbName) } } });
  await prisma.$connect();
  return {
    prisma, label: `embedded:${dbName}`,
    disconnect: async () => { await prisma.$disconnect(); try { await pgi.stop(); } catch {} },
  };
}

/** Prefer the remote Supabase DB; fall back to a local embedded Postgres if the network
 *  blocks the DB port (some ISPs block 5432/6543). Set ORVEX_DB=embedded to force local. */
async function createTestDb() {
  const baseUrl = process.env.DATABASE_URL;
  const force = (process.env.ORVEX_DB ?? "").toLowerCase();
  if (force !== "embedded" && baseUrl) {
    try {
      return await createRemoteTestDb(baseUrl);
    } catch (e) {
      log(`remote DB unreachable (${e?.code ?? e?.message}); falling back to embedded Postgres`);
    }
  }
  return await createEmbeddedTestDb();
}

const RECIPIENT = process.env.LIVE_RECIPIENT ?? "0x3bE3f44cCFF04b0DBe03ADe00710f35eBc387151";
const AMOUNT = process.env.LIVE_AMOUNT ?? "1.00";
const USDC = process.env.BASE_SEPOLIA_USDC_ADDRESS ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

function log(...a) { console.log("[live-e2e]", ...a); }

async function main() {
  // 1) Build the REAL Base Sepolia execution client + its authorized-context registry.
  const { client, registry, config } = buildBaseSepoliaExecutionClient({ env: process.env });
  log("real execution client built; mode=", config.executionMode);

  // 2) Real Core persistence on the real Supabase project (isolated schema).
  const db = await createTestDb();
  log("core db ready:", db.label);
  setConfigForTests({ ...getConfig(), environment: "test" });

  const container = buildContainer({ db: db.prisma, executionClient: client });
  const app = await buildApp({ container });
  await app.ready();

  const companyId = (await db.prisma.company.create({ data: { name: "LIVE E2E" } })).id;

  const H = (role = "AUTHORIZED_OPERATOR") => ({
    "x-company-id": companyId, "x-actor-id": "ai-service", "x-actor-role": role, "x-correlation-id": "corr_live_1",
  });
  const call = (method, url, payload, role) =>
    app.inject({ method, url, headers: H(role), payload });

  // 3) Seed a fully-configured active agent (constitution + policy + capability + budget).
  const agentId = (await call("POST", "/v1/agents", { name: "live_agent" }).then(r => r.json())).data.id;
  await call("PATCH", `/v1/agents/${agentId}`, { status: "ACTIVE" }, "ADMIN");
  const cRes = (await call("POST", "/v1/constitutions", {
    agent_id: agentId,
    config: { purpose: "pay", allowed_actions: ["PAY"], allowed_assets: ["USDC"], allowed_networks: ["base-sepolia"], allowed_categories: ["API"], spending_limits: { single_transaction: "20.00", daily: "100.00" } },
  }, "ADMIN").then(r => r.json())).data.id;
  await call("POST", `/v1/constitutions/${cRes}/activate`, {}, "ADMIN");
  const compiled = (await call("POST", "/v1/policies/compile", {
    name: "p", agent_id: agentId,
    candidate_rules: [
      { rule_id: "amt", type: "AMOUNT_LIMIT", config: { maximum: "20.00" } },
      { rule_id: "net", type: "NETWORK_ALLOW", config: { networks: ["base-sepolia"] } },
      { rule_id: "block", type: "RECIPIENT_BLOCKLIST", config: { recipients: ["0xATTACKER"] } },
    ],
  }, "ADMIN").then(r => r.json())).data;
  await call("POST", `/v1/policies/${compiled.policy.id}/validate`, { policy_version_id: compiled.version.id }, "ADMIN");
  await call("POST", `/v1/policies/${compiled.policy.id}/activate`, { policy_version_id: compiled.version.id }, "ADMIN");
  await db.prisma.capability.create({ data: { companyId, agentId, action: "PAY", asset: "USDC", network: "base-sepolia", singleTransactionLimit: "20.00", validFrom: new Date("2026-09-11T00:00:00Z"), expiresAt: new Date("2026-12-31T00:00:00Z") } });
  await db.prisma.financialAccount.create({ data: { companyId, agentId, scope: "AGENT", scopeKey: agentId, asset: "USDC", network: "base-sepolia", limitAmount: "100.00" } });
  log("agent seeded:", agentId);

  // 4) AI-shaped inputs (the ML layer produces intent + proposal; a security assessment is attached).
  const intent = { intent_id: "intent_live", agent_id: agentId, user_goal: "pay provider 1 USDC", purpose: "renew", desired_outcome: "ok", valid_from: "2026-09-11T00:00:00Z", valid_until: "2026-12-30T00:00:00Z", created_at: "2026-09-11T00:00:00Z" };
  const proposal = { proposal_id: "proposal_live", intent_id: "intent_live", agent_id: agentId, action_type: "PAY", purpose: "renew", amount: { value: AMOUNT, currency: "USDC" }, recipient: { type: "SERVICE", address: RECIPIENT, network: "base-sepolia" }, network: "base-sepolia", created_at: "2026-09-11T12:00:00Z" };
  const assessment = { assessment_id: "assess_live", proposal_id: "proposal_live", intent_verification: { status: "PASS", intent_match: true, score: 1, confidence: 1 }, threat_assessment: { detected: false, confidence: 1, recommended_handling: "MONITOR" }, reputation_assessment: { level: "HIGH", confidence: 1 }, anomaly_assessment: { level: "LOW", confidence: 1 }, risk_assessment: { level: "LOW", confidence: 1 }, overall_assessment: { status: "LOW_RISK", confidence: 1, summary: "ok", recommended_handling: "PROCEED_CANDIDATE" }, created_at: "2026-09-11T12:00:00Z" };

  // 5) Relay through Core exactly as the CoreClient does.
  const intentRow = (await call("POST", "/v1/intents", intent).then(r => r.json())).data.id;
  const proposalRow = (await call("POST", "/v1/proposals", { ...proposal, intent_id: intentRow }).then(r => r.json())).data.id;
  await call("POST", `/v1/proposals/${proposalRow}/assessments`, { ...assessment });
  const decision = (await call("POST", "/v1/decisions", { agent_id: agentId, intent, proposal, security_assessment: assessment }).then(r => r.json())).data;
  log("decision:", decision.result);
  if (decision.result !== "ALLOW") throw new Error(`expected ALLOW, got ${decision.result}`);

  // 6) FinalRevalidation -> mint the ExecutionRequest (the ONLY sanctioned path).
  const txId = "txn_live";
  const analysis = { schema_version: "transaction_analysis.v1", transaction_id: txId, contract: { address: USDC, verified: true }, function: { name: "transfer", selector: "0xa9059cbb" }, decoded_arguments: {}, state_changes_expected: [], recipient: RECIPIENT, amount: AMOUNT, asset: "USDC", risk_flags: [], status: "VALID" };
  const payloadHash = transactionPayloadHash({ transactionId: txId, network: "base-sepolia", recipient: RECIPIENT, amount: AMOUNT, asset: "USDC", contractAddress: USDC, functionSelector: "0xa9059cbb" });
  const prep = await call("POST", "/v1/executions/prepare", {
    agent_id: agentId, decision_id: decision.decision.id, intent, proposal, security_assessment: assessment,
    transaction_id: txId, analysis, expected_network: "base-sepolia", actual_network: "base-sepolia",
    simulation: { schema_version: "simulation_result.v1", transaction_id: txId, status: "PASS", would_revert: false, expected_state_changes: [], unexpected_state_changes: [], revert_reason: null, simulator: { provider: "sim", version: "1" }, simulated_at: "2026-09-11T12:00:00Z" },
    simulated_payload_hash: payloadHash, decision_context_hash: "", financial_scope_key: agentId, asset: "USDC", amount: AMOUNT, require_simulation: true,
  }, "ADMIN");
  if (prep.statusCode !== 201) throw new Error(`prepare failed: ${prep.statusCode} ${prep.body}`);
  const execReq = prep.json().data.execution_request;
  log("execution authorized; execution_id:", execReq.id);

  // 7) THE HOOK: hand the authorized context to the real execution client. Core knows the
  //    authorized recipient/asset/amount/network; the client validates the built tx against it.
  registry.register({
    transactionId: txId,
    executionId: execReq.id,
    context: {
      intent: { schema_version: "transaction_intent.v1", transaction_id: txId, proposal_id: "proposal_live", action_type: "payment", network: "base-sepolia", asset: { symbol: "USDC", address: USDC, type: "erc20" }, amount: AMOUNT, recipient: { address: RECIPIENT }, payment_method: "usdc", constraints: {} },
      expectation: { network: "base-sepolia", chainId: 84532, recipient: RECIPIENT, asset: "USDC", amount: AMOUNT, allowedFunction: "transfer" },
    },
  });

  // 8) Build the frozen ExecutionRequest contract and run the REAL client -> on-chain tx.
  const executionRequest = {
    schema_version: "execution_request.v1",
    execution_id: execReq.id,
    decision_id: decision.decision.id,
    transaction_id: txId,
    executor: { type: "eoa", account: execReq.executorType ?? "eoa" },
    payment_method: "usdc",
    network: "base-sepolia",
    idempotency_key: execReq.idempotencyKey ?? execReq.id,
    authorization_context_hash: execReq.authorizationContextHash ?? "0xauth",
    created_at: new Date().toISOString(),
  };
  log("broadcasting REAL on-chain 1 USDC transfer ...");
  const result = await client.execute(executionRequest);
  log("execution result:", result.status, "tx:", result.transaction_hash);

  // 9) Independent verification (authorized vs actual on-chain).
  const verification = await client.verify(execReq.id);
  log("verify: verified=", verification.verified, "discrepancies=", JSON.stringify(verification.discrepancies));

  // 10) Feed the REAL result back into Core so its financial state commits on the real receipt.
  await call("POST", `/v1/executions/${execReq.id}/result`, { status: result.status === "CONFIRMED" ? "CONFIRMED" : result.status, chain: "base-sepolia", transaction_hash: result.transaction_hash }, "SERVICE");
  const fin = await call("POST", `/v1/executions/${execReq.id}/verify`, { authorized: { recipient: RECIPIENT, asset: "USDC", amount: AMOUNT, network: "base-sepolia" } }, "SERVICE");
  const finJson = fin.json().data;
  log("core finalize: status=", finJson?.verification?.status, "committed=", finJson?.committed);

  if (result.status === "CONFIRMED" && verification.verified) {
    console.log(`LIVE_E2E_OK tx=${result.transaction_hash}`);
    console.log(`LIVE_E2E_EXPLORER https://sepolia.basescan.org/tx/${result.transaction_hash}`);
  } else {
    console.log(`LIVE_E2E_INCOMPLETE status=${result.status} verified=${verification.verified}`);
  }

  await app.close();
  await db.disconnect();
}

main().catch((e) => { console.error("LIVE_E2E_ERROR", e?.code ?? "", e?.message ?? String(e)); process.exit(1); });
