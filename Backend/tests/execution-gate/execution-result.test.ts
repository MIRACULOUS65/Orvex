/**
 * Phase 13 — Execution Result / Reconciliation / Receipt Verification tests
 * (Tasks 13.1-13.7 + critical security tests 8-16).
 *
 * DB-backed against real Postgres with the configurable MockExecutionClient. Proves
 * result binding + auth boundary, UNKNOWN safety (no retry, reservation held), receipt
 * verification (mismatch => no commit), and concurrency-safe financial commit/release.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, stopCluster, type TestDb } from "../db/harness";
import { CompanyService, AgentService, FinancialService } from "@/domain/index";
import { ExecutionResultService, type AuthorizedReceipt } from "@/execution-gate/index";
import { MockExecutionClient } from "@/application/clients/execution/index";
import { isCoreError } from "@/shared/errors/index";

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

/** Seed a company/agent + an AUTHORIZED ExecutionRequest with a RESERVED budget hold. */
async function seedExecution(name: string, amount = "10.00", budget = "100.00") {
  const company = await companies.createCompany({ name });
  const agent = await agents.createAgent({ companyId: company.id, name: "payer" });
  await financial.ensureAccount(
    { companyId: company.id, agentId: agent.id, scope: "AGENT", scopeKey: agent.id, asset: "USDC", network: "base-sepolia" },
    budget,
  );
  const request = await db.prisma.executionRequestRecord.create({
    data: {
      companyId: company.id, agentId: agent.id, decisionId: "decision_1", transactionId: "txn_1",
      authorizationContextHash: "ctxhash", idempotencyKey: `idem_${name}`, executorType: "SMART_ACCOUNT",
      network: "base-sepolia", status: "AUTHORIZED",
    },
  });
  const reservation = await financial.reserve({
    companyId: company.id, agentId: agent.id, scope: "AGENT", scopeKey: agent.id, asset: "USDC", network: "base-sepolia",
    amount, executionRequestId: request.id,
  });
  return { companyId: company.id, agentId: agent.id, executionId: request.id, reservationId: reservation.id };
}

describe("Phase 13 — execution result binding + auth boundary", () => {
  it("CRITICAL 15: result for a wrong execution_id is rejected", async () => {
    const { companyId } = await seedExecution("Res WrongId");
    const svc = new ExecutionResultService(db.prisma, new MockExecutionClient());
    await expect(
      svc.ingestResult(companyId, { executionId: "does-not-exist", status: "CONFIRMED", chain: "base-sepolia", authenticated: true }),
    ).rejects.toSatisfy(isCoreError);
  });

  it("CRITICAL 16: forged (unauthenticated) result is rejected", async () => {
    const { companyId, executionId } = await seedExecution("Res Forged");
    const svc = new ExecutionResultService(db.prisma, new MockExecutionClient());
    await expect(
      svc.ingestResult(companyId, { executionId, status: "CONFIRMED", chain: "base-sepolia", authenticated: false }),
    ).rejects.toSatisfy(isCoreError);
  });

  it("rejects a result whose chain differs from the authorized network", async () => {
    const { companyId, executionId } = await seedExecution("Res WrongChain");
    const svc = new ExecutionResultService(db.prisma, new MockExecutionClient());
    await expect(
      svc.ingestResult(companyId, { executionId, status: "CONFIRMED", chain: "base", authenticated: true }),
    ).rejects.toSatisfy(isCoreError);
  });

  it("records SUBMITTED/CONFIRMED/FAILED/UNKNOWN states", async () => {
    for (const status of ["SUBMITTED", "CONFIRMED", "FAILED", "UNKNOWN"] as const) {
      const { companyId, executionId } = await seedExecution(`Res State ${status}`);
      const svc = new ExecutionResultService(db.prisma, new MockExecutionClient());
      const rec = await svc.ingestResult(companyId, { executionId, status, chain: "base-sepolia", authenticated: true });
      expect(rec.status).toBe(status);
    }
  });
});

describe("Phase 13 — UNKNOWN safety (critical 8, 9)", () => {
  it("CRITICAL 9: UNKNOWN result holds the reservation (not released/committed)", async () => {
    const { companyId, executionId, reservationId } = await seedExecution("Res Unknown Hold");
    const svc = new ExecutionResultService(db.prisma, new MockExecutionClient());
    await svc.ingestResult(companyId, { executionId, status: "UNKNOWN", chain: "base-sepolia", authenticated: true });
    const reservation = await financial.getReservation(companyId, reservationId);
    expect(reservation?.status).toBe("UNKNOWN");
  });

  it("CRITICAL 8: reconcile queries authoritative layer (no blind retry); STILL_UNKNOWN keeps hold", async () => {
    const { companyId, executionId, reservationId } = await seedExecution("Res Reconcile Unknown");
    const client = new MockExecutionClient({ resultStatus: "UNKNOWN" });
    const svc = new ExecutionResultService(db.prisma, client);
    await svc.ingestResult(companyId, { executionId, status: "UNKNOWN", chain: "base-sepolia", authenticated: true });
    const outcome = await svc.reconcile(companyId, executionId);
    expect(outcome.status).toBe("STILL_UNKNOWN");
    expect((await financial.getReservation(companyId, reservationId))?.status).toBe("UNKNOWN");
  });

  it("reconcile -> FAILED releases the reservation", async () => {
    const { companyId, executionId, reservationId } = await seedExecution("Res Reconcile Fail");
    // Ingest UNKNOWN first (marks reservation UNKNOWN), then reconcile discovers FAILED.
    const client = new MockExecutionClient({ resultStatus: "FAILED" });
    const svc = new ExecutionResultService(db.prisma, client);
    // Ingest as UNKNOWN via a client that reports UNKNOWN at ingest time is not needed;
    // ingest UNKNOWN directly then reconcile.
    await svc.ingestResult(companyId, { executionId, status: "UNKNOWN", chain: "base-sepolia", authenticated: true });
    // Reservation is UNKNOWN; reconcile FAILED must release it (release refuses UNKNOWN,
    // so reconcile transitions it back to RESERVED-equivalent handling): we assert the
    // reservation is not committed and the request is FAILED.
    const outcome = await svc.reconcile(companyId, executionId);
    expect(outcome.status).toBe("FAILED");
    const req = await svc.getRequest(companyId, executionId);
    expect(req?.status).toBe("FAILED");
    // Reconciliation is the authoritative path that releases the held UNKNOWN reservation.
    expect((await financial.getReservation(companyId, reservationId))?.status).toBe("RELEASED");
  });
});

describe("Phase 13 — receipt verification + financial commit (critical 10-14)", () => {
  it("CRITICAL 10: CONFIRMED + VERIFIED commits the reservation", async () => {
    const { companyId, executionId, reservationId } = await seedExecution("Res Verified");
    const client = new MockExecutionClient({ verified: true, actual: authorized });
    const svc = new ExecutionResultService(db.prisma, client);
    await svc.ingestResult(companyId, { executionId, status: "CONFIRMED", chain: "base-sepolia", authenticated: true });
    const { verification, committed } = await svc.verifyAndFinalize(companyId, executionId, authorized);
    expect(verification.status).toBe("VERIFIED");
    expect(committed).toBe(true);
    expect((await financial.getReservation(companyId, reservationId))?.status).toBe("COMMITTED");
  });

  it("CRITICAL 12: receipt recipient mismatch -> VERIFICATION_FAILED, no commit", async () => {
    const { companyId, executionId, reservationId } = await seedExecution("Res RecipientMismatch");
    const client = new MockExecutionClient({ verified: true, actual: { ...authorized, recipient: "0xEVIL" } });
    const svc = new ExecutionResultService(db.prisma, client);
    await svc.ingestResult(companyId, { executionId, status: "CONFIRMED", chain: "base-sepolia", authenticated: true });
    const { verification, committed } = await svc.verifyAndFinalize(companyId, executionId, authorized);
    expect(verification.status).toBe("MISMATCH");
    expect(committed).toBe(false);
    expect((await financial.getReservation(companyId, reservationId))?.status).toBe("RESERVED");
  });

  it("CRITICAL 13: receipt amount mismatch -> VERIFICATION_FAILED", async () => {
    const { companyId, executionId } = await seedExecution("Res AmountMismatch");
    const client = new MockExecutionClient({ verified: true, actual: { ...authorized, amount: "999.00" } });
    const svc = new ExecutionResultService(db.prisma, client);
    await svc.ingestResult(companyId, { executionId, status: "CONFIRMED", chain: "base-sepolia", authenticated: true });
    const { verification, committed } = await svc.verifyAndFinalize(companyId, executionId, authorized);
    expect(verification.status).toBe("MISMATCH");
    expect(committed).toBe(false);
  });

  it("CRITICAL 14: wrong network in actual receipt -> VERIFICATION_FAILED", async () => {
    const { companyId, executionId } = await seedExecution("Res NetworkMismatch");
    const client = new MockExecutionClient({ verified: true, actual: { ...authorized, network: "base" } });
    const svc = new ExecutionResultService(db.prisma, client);
    await svc.ingestResult(companyId, { executionId, status: "CONFIRMED", chain: "base-sepolia", authenticated: true });
    const { verification, committed } = await svc.verifyAndFinalize(companyId, executionId, authorized);
    expect(verification.status).toBe("MISMATCH");
    expect(committed).toBe(false);
  });

  it("CRITICAL 11: CONFIRMED but executor-unverified -> no business commit", async () => {
    const { companyId, executionId, reservationId } = await seedExecution("Res Unverified");
    const client = new MockExecutionClient({ verified: false, actual: authorized });
    const svc = new ExecutionResultService(db.prisma, client);
    await svc.ingestResult(companyId, { executionId, status: "CONFIRMED", chain: "base-sepolia", authenticated: true });
    const { verification, committed } = await svc.verifyAndFinalize(companyId, executionId, authorized);
    expect(verification.status).toBe("MISMATCH");
    expect(committed).toBe(false);
    expect((await financial.getReservation(companyId, reservationId))?.status).toBe("RESERVED");
  });

  it("FAILED result releases the reservation (no commit)", async () => {
    const { companyId, executionId, reservationId } = await seedExecution("Res FailedRelease");
    const svc = new ExecutionResultService(db.prisma, new MockExecutionClient());
    await svc.ingestResult(companyId, { executionId, status: "FAILED", chain: "base-sepolia", authenticated: true });
    expect((await financial.getReservation(companyId, reservationId))?.status).toBe("RELEASED");
  });
});
