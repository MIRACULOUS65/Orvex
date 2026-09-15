/**
 * Phase 11 — Human Approval tests (Tasks 11.2-11.7 + critical security tests 8-11 + state machine).
 *
 * DB-backed against real Postgres. Verifies approval lifecycle, context-hash binding
 * (approve $5->A then tx $5->B = APPROVAL_MISMATCH), expiration boundary, approver
 * role/company authorization, and state-machine immutability.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, stopCluster, type TestDb } from "../db/harness";
import { CompanyService, AgentService } from "@/domain/index";
import { DecisionService, DecisionEngine } from "@/decision/index";
import { ApprovalService, type Approver } from "@/approval/index";
import { isCoreError } from "@/shared/errors/index";

let db: TestDb;
let companies: CompanyService;
let agents: AgentService;
let decisions: DecisionService;
let approvals: ApprovalService;
const engine = new DecisionEngine();

beforeAll(async () => {
  db = await createTestDb();
  companies = new CompanyService(db.prisma);
  agents = new AgentService(db.prisma);
  decisions = new DecisionService(db.prisma);
  approvals = new ApprovalService(db.prisma);
}, 120_000);

afterAll(async () => {
  await db?.disconnect();
  await stopCluster();
});

/** Create a company + agent + a REVIEW decision, returning ids + a context hash. */
async function seedReviewDecision(name: string) {
  const company = await companies.createCompany({ name });
  const agent = await agents.createAgent({ companyId: company.id, name: "payer" });
  const contextHash = engine.contextHash({
    intentId: "i1",
    proposalId: "p1",
    policyId: "pol1",
    policyVersion: 1,
    policyEvaluationHash: "peh",
    securityAssessmentId: "sa1",
    transactionId: "t1",
    transactionPayloadHash: "hash_5_to_A",
    simulationId: "s1",
    approvalContextHash: null,
  });
  const decision = await decisions.record({
    companyId: company.id,
    agentId: agent.id,
    intentId: "i1",
    proposalId: "p1",
    output: { result: "REVIEW", reasons: ["needs approval"], determinant: "approval_required" },
    decisionContextHash: contextHash,
  });
  return { companyId: company.id, agentId: agent.id, decisionId: decision.id, contextHash };
}

function future(ms = 600_000): Date {
  return new Date(Date.now() + ms);
}

const admin: Approver = { approverId: "user_1", companyId: "", role: "AUTHORIZED_OPERATOR" };

describe("Phase 11 — approval lifecycle", () => {
  it("creates a PENDING request and APPROVES it with matching context + authorized approver", async () => {
    const { companyId, agentId, decisionId, contextHash } = await seedReviewDecision("Approve OK");
    const req = await approvals.createRequest({
      companyId, agentId, decisionId, requiredRole: "AUTHORIZED_OPERATOR",
      summary: { amount: "5.00", recipient: "A" }, contextHash, expiresAt: future(),
    });
    expect(req.status).toBe("PENDING");
    const { request } = await approvals.approve(companyId, req.id, { ...admin, companyId }, contextHash);
    expect(request.status).toBe("APPROVED");
    // resolveApprovalState reflects APPROVED for the same context.
    expect(await approvals.resolveApprovalState(companyId, req.id, contextHash)).toBe("APPROVED");
  });

  it("DENY yields a terminal DENIED request", async () => {
    const { companyId, agentId, decisionId, contextHash } = await seedReviewDecision("Deny");
    const req = await approvals.createRequest({ companyId, agentId, decisionId, requiredRole: "AUTHORIZED_OPERATOR", summary: {}, contextHash, expiresAt: future() });
    const { request } = await approvals.deny(companyId, req.id, { ...admin, companyId });
    expect(request.status).toBe("DENIED");
    expect(await approvals.resolveApprovalState(companyId, req.id, contextHash)).toBe("DENIED");
  });
});

describe("Phase 11 — context binding (CRITICAL 8)", () => {
  it("approve $5->A, then current tx becomes $5->B => APPROVAL_MISMATCH", async () => {
    const { companyId, agentId, decisionId, contextHash } = await seedReviewDecision("Mismatch");
    const req = await approvals.createRequest({ companyId, agentId, decisionId, requiredRole: "AUTHORIZED_OPERATOR", summary: {}, contextHash, expiresAt: future() });
    // The current context hash now reflects a mutated transaction ($5 -> B).
    const mutatedHash = engine.contextHash({
      intentId: "i1", proposalId: "p1", policyId: "pol1", policyVersion: 1, policyEvaluationHash: "peh",
      securityAssessmentId: "sa1", transactionId: "t1", transactionPayloadHash: "hash_5_to_B",
      simulationId: "s1", approvalContextHash: null,
    });
    await expect(
      approvals.approve(companyId, req.id, { ...admin, companyId }, mutatedHash),
    ).rejects.toSatisfy(isCoreError);
  });

  it("an APPROVED approval becomes MISMATCH if the context later changes", async () => {
    const { companyId, agentId, decisionId, contextHash } = await seedReviewDecision("Later Mismatch");
    const req = await approvals.createRequest({ companyId, agentId, decisionId, requiredRole: "AUTHORIZED_OPERATOR", summary: {}, contextHash, expiresAt: future() });
    await approvals.approve(companyId, req.id, { ...admin, companyId }, contextHash);
    expect(await approvals.resolveApprovalState(companyId, req.id, "some_other_hash")).toBe("MISMATCH");
  });
});

describe("Phase 11 — expiration (CRITICAL 9)", () => {
  it("cannot approve an expired request; state resolves EXPIRED", async () => {
    const { companyId, agentId, decisionId, contextHash } = await seedReviewDecision("Expired");
    const req = await approvals.createRequest({
      companyId, agentId, decisionId, requiredRole: "AUTHORIZED_OPERATOR", summary: {}, contextHash,
      expiresAt: new Date(Date.now() - 1000), // already expired
    });
    await expect(approvals.approve(companyId, req.id, { ...admin, companyId }, contextHash)).rejects.toSatisfy(isCoreError);
    expect(await approvals.resolveApprovalState(companyId, req.id, contextHash)).toBe("EXPIRED");
  });

  it("boundary: an approval expiring in the future is still approvable", async () => {
    const { companyId, agentId, decisionId, contextHash } = await seedReviewDecision("Boundary");
    const req = await approvals.createRequest({ companyId, agentId, decisionId, requiredRole: "AUTHORIZED_OPERATOR", summary: {}, contextHash, expiresAt: future(5000) });
    const { request } = await approvals.approve(companyId, req.id, { ...admin, companyId }, contextHash);
    expect(request.status).toBe("APPROVED");
  });
});

describe("Phase 11 — approver authorization (CRITICAL 10, 11)", () => {
  it("CRITICAL 10: wrong-role approver (AUDITOR/READ_ONLY/AGENT_SERVICE) rejected", async () => {
    const { companyId, agentId, decisionId, contextHash } = await seedReviewDecision("WrongRole");
    const req = await approvals.createRequest({ companyId, agentId, decisionId, requiredRole: "AUTHORIZED_OPERATOR", summary: {}, contextHash, expiresAt: future() });
    for (const role of ["AUDITOR", "READ_ONLY", "AGENT_SERVICE"]) {
      await expect(
        approvals.approve(companyId, req.id, { approverId: "u", companyId, role }, contextHash),
      ).rejects.toSatisfy(isCoreError);
    }
  });

  it("CRITICAL 11: wrong-company approver rejected", async () => {
    const { companyId, agentId, decisionId, contextHash } = await seedReviewDecision("WrongCompany");
    const req = await approvals.createRequest({ companyId, agentId, decisionId, requiredRole: "AUTHORIZED_OPERATOR", summary: {}, contextHash, expiresAt: future() });
    await expect(
      approvals.approve(companyId, req.id, { approverId: "u", companyId: "other-company", role: "AUTHORIZED_OPERATOR" }, contextHash),
    ).rejects.toSatisfy(isCoreError);
  });
});

describe("Phase 11 — state machine immutability", () => {
  it("cannot re-approve or deny a terminal (APPROVED) request", async () => {
    const { companyId, agentId, decisionId, contextHash } = await seedReviewDecision("Terminal");
    const req = await approvals.createRequest({ companyId, agentId, decisionId, requiredRole: "AUTHORIZED_OPERATOR", summary: {}, contextHash, expiresAt: future() });
    await approvals.approve(companyId, req.id, { ...admin, companyId }, contextHash);
    await expect(approvals.approve(companyId, req.id, { ...admin, companyId }, contextHash)).rejects.toSatisfy(isCoreError);
    await expect(approvals.deny(companyId, req.id, { ...admin, companyId })).rejects.toSatisfy(isCoreError);
  });
});
