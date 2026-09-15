/**
 * Phase 14 — Audit, Forensic Reconstruction, Attestation tests (Tasks 14.1-14.7) +
 * crash/recovery.
 *
 * DB-backed against real Postgres. Proves hash-chained append-only audit + idempotency,
 * full-lifecycle forensic reconstruction by execution_id, attestation lifecycle, and —
 * critically — that attestation failure never rewrites verified payment state. Crash/
 * recovery: state persisted before a simulated restart is recovered without duplication.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, stopCluster, type TestDb } from "../db/harness";
import { CompanyService, AgentService, FinancialService } from "@/domain/index";
import { ExecutionResultService, type AuthorizedReceipt } from "@/execution-gate/index";
import { MockExecutionClient } from "@/application/clients/execution/index";
import {
  AuditService,
  AttestationService,
  MockAttestationAdapter,
  ForensicReconstructionService,
  type AttestationPayload,
} from "@/audit/index";

let db: TestDb;
let companies: CompanyService;
let agents: AgentService;
let financial: FinancialService;

beforeAll(async () => {
  db = await createTestDb();
  companies = new CompanyService(db.prisma);
  agents = new AgentService(db.prisma);
  financial = new FinancialService(db.prisma);
}, 120_000);

afterAll(async () => {
  await db?.disconnect();
  await stopCluster();
});

const authorized: AuthorizedReceipt = { recipient: "0xrecipient", asset: "USDC", amount: "10.00", network: "base-sepolia" };

/** Seed a full verified execution: company/agent + AUTHORIZED request + reservation + confirmed+verified. */
async function seedVerifiedExecution(name: string) {
  const company = await companies.createCompany({ name });
  const agent = await agents.createAgent({ companyId: company.id, name: "payer" });
  await financial.ensureAccount(
    { companyId: company.id, agentId: agent.id, scope: "AGENT", scopeKey: agent.id, asset: "USDC", network: "base-sepolia" },
    "100.00",
  );
  const decision = await db.prisma.decision.create({
    data: {
      companyId: company.id, agentId: agent.id, intentId: "intent_1", proposalId: "proposal_1",
      result: "ALLOW", reasonsJson: ["ok"] as unknown as object, determinant: "allow", decisionContextHash: "ctx", version: 1,
    },
  });
  const request = await db.prisma.executionRequestRecord.create({
    data: {
      companyId: company.id, agentId: agent.id, decisionId: decision.id, transactionId: "txn_1",
      authorizationContextHash: "ctx", idempotencyKey: `idem_${name}`, executorType: "SMART_ACCOUNT",
      network: "base-sepolia", status: "AUTHORIZED",
    },
  });
  await financial.reserve({
    companyId: company.id, agentId: agent.id, scope: "AGENT", scopeKey: agent.id, asset: "USDC", network: "base-sepolia",
    amount: "10.00", executionRequestId: request.id,
  });
  const svc = new ExecutionResultService(db.prisma, new MockExecutionClient({ verified: true, actual: authorized }));
  await svc.ingestResult(company.id, { executionId: request.id, status: "CONFIRMED", chain: "base-sepolia", authenticated: true });
  const { verification } = await svc.verifyAndFinalize(company.id, request.id, authorized);
  return { companyId: company.id, agentId: agent.id, decisionId: decision.id, executionId: request.id, verification };
}

function attestationPayload(companyId: string, agentId: string, executionId: string, decisionId: string): AttestationPayload {
  return {
    companyId, agentId, executionRequestId: executionId, decisionId,
    traceMerkleRoot: "0xroot", policyHash: "0xpolicy", decision: "ALLOW", transactionHash: "0xtx",
  };
}

describe("Phase 14 — audit hash chain + idempotency", () => {
  it("appends a hash-chained, verifiable timeline", async () => {
    const company = await companies.createCompany({ name: "Audit Chain" });
    const audit = new AuditService(db.prisma);
    const e1 = await audit.append({ companyId: company.id, entityType: "EXECUTION", entityId: "exec_1", eventType: "AUTHORIZED", actorType: "SYSTEM", actorId: "core", payload: { step: 1 } });
    const e2 = await audit.append({ companyId: company.id, entityType: "EXECUTION", entityId: "exec_1", eventType: "SUBMITTED", actorType: "SYSTEM", actorId: "core", payload: { step: 2 } });
    expect(e2.previousEventHash).toBe(e1.eventHash);
    expect(await audit.verifyChain(company.id, "EXECUTION", "exec_1")).toBe(true);
  });

  it("is idempotent: re-appending the identical logical event does not duplicate", async () => {
    const company = await companies.createCompany({ name: "Audit Idem" });
    const audit = new AuditService(db.prisma);
    const first = await audit.append({ companyId: company.id, entityType: "DECISION", entityId: "d1", eventType: "MADE", actorType: "SYSTEM", actorId: "core", payload: { r: "ALLOW" } });
    const again = await audit.append({ companyId: company.id, entityType: "DECISION", entityId: "d1", eventType: "MADE", actorType: "SYSTEM", actorId: "core", payload: { r: "ALLOW" } });
    expect(again.id).toBe(first.id);
    const timeline = await audit.getEntityTimeline(company.id, "DECISION", "d1");
    expect(timeline).toHaveLength(1);
  });

  it("detects tampering: a mutated stored payload breaks chain verification", async () => {
    const company = await companies.createCompany({ name: "Audit Tamper" });
    const audit = new AuditService(db.prisma);
    const e = await audit.append({ companyId: company.id, entityType: "EXECUTION", entityId: "exec_t", eventType: "AUTHORIZED", actorType: "SYSTEM", actorId: "core", payload: { step: 1 } });
    await db.prisma.auditEvent.update({ where: { id: e.id }, data: { payloadJson: { step: 999 } as unknown as object } });
    expect(await audit.verifyChain(company.id, "EXECUTION", "exec_t")).toBe(false);
  });
});

describe("Phase 14 — forensic reconstruction by execution_id (Task 14.7)", () => {
  it("reconstructs the full lifecycle for a verified execution", async () => {
    const { companyId, executionId } = await seedVerifiedExecution("Forensic OK");
    const forensic = new ForensicReconstructionService(db.prisma);
    const record = await forensic.reconstruct(companyId, executionId);
    expect(record).not.toBeNull();
    expect(record!.executionRequest).toBeTruthy();
    expect(record!.decision).toBeTruthy();
    expect(record!.executionResults.length).toBeGreaterThan(0);
    expect(record!.receiptVerifications.length).toBeGreaterThan(0);
    expect(record!.financialReservations.length).toBeGreaterThan(0);
    expect(record!.complete).toBe(true);
  });

  it("returns null for an unknown execution_id (tenant-scoped)", async () => {
    const company = await companies.createCompany({ name: "Forensic Missing" });
    const forensic = new ForensicReconstructionService(db.prisma);
    expect(await forensic.reconstruct(company.id, "nope")).toBeNull();
  });
});

describe("Phase 14 — attestation lifecycle + failure isolation (Task 14.6)", () => {
  it("attests successfully (PENDING -> CONFIRMED)", async () => {
    const { companyId, agentId, decisionId, executionId } = await seedVerifiedExecution("Attest OK");
    const svc = new AttestationService(db.prisma, new MockAttestationAdapter());
    const record = await svc.attest(attestationPayload(companyId, agentId, executionId, decisionId));
    expect(record.status).toBe("CONFIRMED");
    expect(record.registryTxHash).toBeTruthy();
  });

  it("CRITICAL: attestation FAILURE does not rewrite verified payment state", async () => {
    const { companyId, agentId, decisionId, executionId, verification } = await seedVerifiedExecution("Attest Fail Isolated");
    expect(verification.status).toBe("VERIFIED");

    const svc = new AttestationService(db.prisma, new MockAttestationAdapter({ fail: true }));
    const record = await svc.attest(attestationPayload(companyId, agentId, executionId, decisionId));
    expect(record.status).toBe("FAILED");

    // Payment/verification truth is unchanged: receipt still VERIFIED, reservation COMMITTED.
    const receipts = await db.prisma.receiptVerificationRecord.findMany({ where: { executionRequestId: executionId } });
    expect(receipts[0]?.status).toBe("VERIFIED");
    const reservation = await db.prisma.financialReservation.findFirst({ where: { executionRequestId: executionId } });
    expect(reservation?.status).toBe("COMMITTED");

    // Attestation can be retried INDEPENDENTLY and succeed without touching payment.
    const retried = await new AttestationService(db.prisma, new MockAttestationAdapter()).retry(
      companyId, record.id, attestationPayload(companyId, agentId, executionId, decisionId),
    );
    expect(retried.status).toBe("CONFIRMED");
  });
});

describe("Phase 14 — crash / recovery", () => {
  it("recovers UNKNOWN execution state after a simulated restart without duplicate execution", async () => {
    const company = await companies.createCompany({ name: "Crash Unknown" });
    const agent = await agents.createAgent({ companyId: company.id, name: "payer" });
    await financial.ensureAccount({ companyId: company.id, agentId: agent.id, scope: "AGENT", scopeKey: agent.id, asset: "USDC", network: "base-sepolia" }, "100.00");
    const request = await db.prisma.executionRequestRecord.create({
      data: { companyId: company.id, agentId: agent.id, decisionId: "d1", transactionId: "txn_1", authorizationContextHash: "ctx", idempotencyKey: "idem_crash", executorType: "SMART_ACCOUNT", network: "base-sepolia", status: "AUTHORIZED" },
    });
    const reservation = await financial.reserve({ companyId: company.id, agentId: agent.id, scope: "AGENT", scopeKey: agent.id, asset: "USDC", network: "base-sepolia", amount: "10.00", executionRequestId: request.id });

    // "Crash" during UNKNOWN: ingest UNKNOWN, then simulate a restart with a NEW service
    // instance + NEW prisma-less state; recovery reads durable state.
    const svc1 = new ExecutionResultService(db.prisma, new MockExecutionClient({ resultStatus: "UNKNOWN" }));
    await svc1.ingestResult(company.id, { executionId: request.id, status: "UNKNOWN", chain: "base-sepolia", authenticated: true });

    // Restart: fresh service instance recovers from durable Postgres state.
    const svc2 = new ExecutionResultService(db.prisma, new MockExecutionClient({ resultStatus: "UNKNOWN" }));
    const recoveredRequest = await svc2.getRequest(company.id, request.id);
    expect(recoveredRequest?.status).toBe("UNKNOWN");
    // Reservation is still HELD (UNKNOWN) — not duplicated, not committed, not released.
    expect((await financial.getReservation(company.id, reservation.id))?.status).toBe("UNKNOWN");
    // Idempotency: only one execution request exists for this key.
    const all = await db.prisma.executionRequestRecord.findMany({ where: { companyId: company.id, idempotencyKey: "idem_crash" } });
    expect(all).toHaveLength(1);
  });
});
