/**
 * /v1 product API — Backend/Core product surface.
 *
 * The Dashboard/SDK-facing HTTP surface over the completed Phase 1-14 services. Every
 * route runs behind the tenant/auth boundary (registerTenantAuth) and returns the
 * api.v1 envelope. Read routes are tenant-scoped; write routes reuse the existing
 * deterministic services (no new authorization logic, no execution bypass).
 *
 * The single sanctioned execution path is preserved:
 *   POST /v1/decisions            -> SecurityOrchestrator + DecisionEngine
 *   POST /v1/executions/prepare   -> FinalRevalidationService (re-derives decision)
 *   POST /v1/executions/:id/*     -> ExecutionResultService (result/reconcile/verify)
 * There is deliberately NO /v1/execute or force/raw path.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { CoreError } from "../../shared/errors/index.js";
import { ok, parsePagination, pageMeta } from "../http/envelope.js";
import { registerTenantAuth, requireAuth, requireRole } from "../http/auth.js";
import { emitEvent } from "../http/events.js";
import type { Container } from "../http/container.js";

type Params = { id: string };
type ExecParams = { executionId: string };
type ProposalParams = { proposalId: string };

function body<T>(req: FastifyRequest): T {
  return (req.body ?? {}) as T;
}

/** Register all /v1 routes under an authenticated scope. */
export async function registerV1Routes(app: FastifyInstance, c: Container): Promise<void> {
  await app.register(
    async (v1) => {
      registerTenantAuth(v1);

      // ---- Agents ------------------------------------------------------- //
      v1.get("/agents", async (req) => {
        const auth = requireAuth(req);
        const p = parsePagination(req.query as Record<string, unknown>);
        const rows = await c.agent.listAgents(auth.companyId);
        const paged = rows.slice(p.skip, p.skip + p.take);
        return ok(req, paged, pageMeta(p, rows.length));
      });

      v1.get<{ Params: Params }>("/agents/:id", async (req) => {
        const auth = requireAuth(req);
        const agent = await c.agent.requireAgent(auth.companyId, req.params.id);
        return ok(req, agent);
      });

      v1.get<{ Params: Params }>("/agents/:id/status", async (req) => {
        const auth = requireAuth(req);
        const agent = await c.agent.requireAgent(auth.companyId, req.params.id);
        return ok(req, { id: agent.id, status: agent.status, execution_mode: agent.executionMode });
      });

      v1.post("/agents", async (req, reply) => {
        const auth = requireAuth(req);
        requireRole(auth, ["ADMIN", "AUTHORIZED_OPERATOR", "SERVICE"]);
        const b = body<{ name: string; purpose?: string; execution_mode?: string }>(req);
        const agent = await c.agent.createAgent({
          companyId: auth.companyId,
          name: b.name,
          purpose: b.purpose,
          executionMode: b.execution_mode as never,
        });
        emitEvent(req, "agent.created", { agent_id: agent.id });
        reply.code(201);
        return ok(req, agent);
      });

      // Safe config-only update (never self-authority): purpose / execution_mode / lifecycle.
      v1.patch<{ Params: Params }>("/agents/:id", async (req) => {
        const auth = requireAuth(req);
        requireRole(auth, ["ADMIN", "AUTHORIZED_OPERATOR", "SERVICE"]);
        const b = body<{ status?: string; purpose?: string }>(req);
        await c.agent.requireAgent(auth.companyId, req.params.id);
        if (b.status) {
          const map: Record<string, () => Promise<unknown>> = {
            ACTIVE: () => c.agent.activateAgent(auth.companyId, req.params.id),
            PAUSED: () => c.agent.pauseAgent(auth.companyId, req.params.id),
            SUSPENDED: () => c.agent.suspendAgent(auth.companyId, req.params.id),
            DISABLED: () => c.agent.disableAgent(auth.companyId, req.params.id),
          };
          const fn = map[b.status];
          if (!fn) throw CoreError.of("INVALID_INPUT", "Unsupported agent status transition.");
          await fn();
        }
        const updated = await c.agent.requireAgent(auth.companyId, req.params.id);
        emitEvent(req, "agent.updated", { agent_id: updated.id, status: updated.status });
        return ok(req, updated);
      });

      // ---- Intents ------------------------------------------------------ //
      v1.get("/intents", async (req) => {
        const auth = requireAuth(req);
        const p = parsePagination(req.query as Record<string, unknown>);
        const { rows, total } = await c.intake.listIntents(auth.companyId, p.skip, p.take);
        return ok(req, rows, pageMeta(p, total));
      });

      v1.get<{ Params: Params }>("/intents/:id", async (req) => {
        const auth = requireAuth(req);
        const intent = await c.intake.getIntent(auth.companyId, req.params.id);
        if (!intent) throw CoreError.of("NOT_FOUND", "Intent not found.");
        return ok(req, intent);
      });

      v1.post("/intents", async (req, reply) => {
        const auth = requireAuth(req);
        const intent = await c.intake.createIntent(auth.companyId, req.body);
        emitEvent(req, "intent.created", { intent_id: intent.id, agent_id: intent.agentId });
        reply.code(201);
        return ok(req, intent);
      });

      // ---- Proposals ---------------------------------------------------- //
      v1.get("/proposals", async (req) => {
        const auth = requireAuth(req);
        const p = parsePagination(req.query as Record<string, unknown>);
        const { rows, total } = await c.intake.listProposals(auth.companyId, p.skip, p.take);
        return ok(req, rows, pageMeta(p, total));
      });

      v1.get<{ Params: Params }>("/proposals/:id", async (req) => {
        const auth = requireAuth(req);
        const proposal = await c.intake.getProposal(auth.companyId, req.params.id);
        if (!proposal) throw CoreError.of("NOT_FOUND", "Proposal not found.");
        return ok(req, proposal);
      });

      v1.post("/proposals", async (req, reply) => {
        const auth = requireAuth(req);
        const proposal = await c.intake.createProposal(auth.companyId, req.body);
        emitEvent(req, "proposal.created", { proposal_id: proposal.id, intent_id: proposal.intentId });
        reply.code(201);
        return ok(req, proposal);
      });

      // Security assessment ingestion (intelligence, NOT authority).
      v1.post<{ Params: ProposalParams }>("/proposals/:proposalId/assessments", async (req, reply) => {
        const auth = requireAuth(req);
        const record = await c.intake.ingestAssessment(auth.companyId, req.params.proposalId, req.body);
        emitEvent(req, "security.assessed", { proposal_id: req.params.proposalId, assessment_id: record.id });
        reply.code(201);
        return ok(req, record);
      });

      v1.get<{ Params: ProposalParams }>("/proposals/:proposalId/assessment", async (req) => {
        const auth = requireAuth(req);
        const record = await c.intake.getLatestAssessment(auth.companyId, req.params.proposalId);
        if (!record) throw CoreError.of("NOT_FOUND", "No assessment for this proposal.");
        return ok(req, record);
      });

      // ---- Policies ----------------------------------------------------- //
      v1.get("/policies", async (req) => {
        const auth = requireAuth(req);
        const p = parsePagination(req.query as Record<string, unknown>);
        const [rows, total] = await Promise.all([
          c.db.policy.findMany({ where: { companyId: auth.companyId }, orderBy: { createdAt: "desc" }, skip: p.skip, take: p.take }),
          c.db.policy.count({ where: { companyId: auth.companyId } }),
        ]);
        return ok(req, rows, pageMeta(p, total));
      });

      v1.get<{ Params: Params }>("/policies/:id", async (req) => {
        const auth = requireAuth(req);
        const policy = await c.policy.getPolicy(auth.companyId, req.params.id);
        if (!policy) throw CoreError.of("NOT_FOUND", "Policy not found.");
        return ok(req, policy);
      });

      v1.get<{ Params: Params }>("/policies/:id/versions", async (req) => {
        const auth = requireAuth(req);
        const policy = await c.policy.getPolicy(auth.companyId, req.params.id);
        if (!policy) throw CoreError.of("NOT_FOUND", "Policy not found.");
        const versions = await c.db.policyVersion.findMany({
          where: { policyId: policy.id },
          orderBy: { version: "asc" },
        });
        return ok(req, versions);
      });

      // Create a DRAFT policy (from explicit rules).
      v1.post("/policies", async (req, reply) => {
        const auth = requireAuth(req);
        requireRole(auth, ["ADMIN", "AUTHORIZED_OPERATOR", "SERVICE"]);
        const b = body<{ name: string; agent_id?: string; description?: string; rules: unknown[] }>(req);
        const { policy, version } = await c.policy.createDraft({
          companyId: auth.companyId,
          agentId: b.agent_id ?? null,
          name: b.name,
          description: b.description,
          rules: (b.rules ?? []) as never,
        });
        emitEvent(req, "policy.created", { policy_id: policy.id, version: version.version });
        reply.code(201);
        return ok(req, { policy, version });
      });

      // Compile natural-language / candidate rules into a DRAFT policy version. The
      // result is ALWAYS a DRAFT — it can never silently become ACTIVE.
      v1.post("/policies/compile", async (req, reply) => {
        const auth = requireAuth(req);
        requireRole(auth, ["ADMIN", "AUTHORIZED_OPERATOR", "SERVICE"]);
        const b = body<{ name: string; agent_id?: string; candidate_rules: unknown[] }>(req);
        const { policy, version } = await c.policy.createDraft({
          companyId: auth.companyId,
          agentId: b.agent_id ?? null,
          name: b.name,
          description: "compiled candidate (DRAFT)",
          rules: (b.candidate_rules ?? []) as never,
          sourceType: "AI_COMPILED",
        });
        emitEvent(req, "policy.compiled", { policy_id: policy.id, version: version.version });
        reply.code(201);
        return ok(req, { policy, version, status: version.status });
      });

      v1.post<{ Params: Params }>("/policies/:id/validate", async (req) => {
        const auth = requireAuth(req);
        requireRole(auth, ["ADMIN", "AUTHORIZED_OPERATOR", "SERVICE"]);
        const b = body<{ policy_version_id: string }>(req);
        const validating = await c.policy.validate(auth.companyId, b.policy_version_id);
        const simulated = await c.policy.simulate(auth.companyId, b.policy_version_id);
        const approved = await c.policy.approve(auth.companyId, b.policy_version_id, auth.actorId);
        emitEvent(req, "policy.validated", { policy_id: req.params.id, policy_version_id: b.policy_version_id });
        return ok(req, { validating, simulated, approved });
      });

      // Explicit activation — the ONLY way an AI-compiled policy becomes ACTIVE.
      v1.post<{ Params: Params }>("/policies/:id/activate", async (req) => {
        const auth = requireAuth(req);
        requireRole(auth, ["ADMIN", "AUTHORIZED_OPERATOR"]);
        const b = body<{ policy_version_id: string }>(req);
        const activated = await c.policy.activate(auth.companyId, b.policy_version_id);
        // Point the agent at the active policy when the policy is agent-scoped.
        const policy = await c.policy.getPolicy(auth.companyId, req.params.id);
        if (policy?.agentId) {
          await c.db.agent.update({ where: { id: policy.agentId }, data: { activePolicyId: policy.id } });
        }
        emitEvent(req, "policy.activated", { policy_id: req.params.id, policy_version_id: b.policy_version_id });
        return ok(req, activated);
      });

      // ---- Constitutions ------------------------------------------------ //
      v1.post("/constitutions", async (req, reply) => {
        const auth = requireAuth(req);
        requireRole(auth, ["ADMIN", "AUTHORIZED_OPERATOR", "SERVICE"]);
        const b = body<{ agent_id: string; config: never }>(req);
        const constitution = await c.constitution.createConstitution({
          companyId: auth.companyId,
          agentId: b.agent_id,
          config: b.config,
          createdBy: auth.actorId,
        });
        emitEvent(req, "constitution.created", { constitution_id: constitution.id });
        reply.code(201);
        return ok(req, constitution);
      });

      v1.post<{ Params: Params }>("/constitutions/:id/activate", async (req) => {
        const auth = requireAuth(req);
        requireRole(auth, ["ADMIN", "AUTHORIZED_OPERATOR"]);
        const activated = await c.constitution.activateConstitution(auth.companyId, req.params.id);
        emitEvent(req, "constitution.activated", { constitution_id: activated.id });
        return ok(req, activated);
      });

      // ---- Decisions ---------------------------------------------------- //
      v1.get("/decisions", async (req) => {
        const auth = requireAuth(req);
        const p = parsePagination(req.query as Record<string, unknown>);
        const [rows, total] = await Promise.all([
          c.db.decision.findMany({ where: { companyId: auth.companyId }, orderBy: { createdAt: "desc" }, skip: p.skip, take: p.take }),
          c.db.decision.count({ where: { companyId: auth.companyId } }),
        ]);
        return ok(req, rows, pageMeta(p, total));
      });

      v1.get<{ Params: Params }>("/decisions/:id", async (req) => {
        const auth = requireAuth(req);
        const decision = await c.decision.getDecision(auth.companyId, req.params.id);
        if (!decision) throw CoreError.of("NOT_FOUND", "Decision not found.");
        return ok(req, decision);
      });

      v1.get<{ Params: Params }>("/decisions/:id/timeline", async (req) => {
        const auth = requireAuth(req);
        const decision = await c.decision.getDecision(auth.companyId, req.params.id);
        if (!decision) throw CoreError.of("NOT_FOUND", "Decision not found.");
        const timeline = await c.audit.getEntityTimeline(auth.companyId, "DECISION", decision.id);
        return ok(req, { decision, timeline });
      });

      /**
       * Create a Decision. Runs the deterministic SecurityOrchestrator to assemble the
       * authoritative context (which itself runs the deterministic PolicyEngine), then
       * maps the orchestration + advisory security signal to an ALLOW/REVIEW/DENY via
       * the DecisionEngine. The AI SecurityAssessment is advisory ONLY — it can never
       * produce ALLOW. A REVIEW auto-creates a PENDING ApprovalRequest bound to the
       * decision context hash. The decision is persisted immutably.
       */
      v1.post("/decisions", async (req, reply) => {
        const auth = requireAuth(req);
        const b = body<{
          agent_id: string;
          intent: unknown;
          proposal: unknown;
          security_assessment: unknown;
          trace_id?: string;
          assessment_max_age_ms?: number;
          require_simulation?: boolean;
        }>(req);

        // Parse the AI-layer contracts (schema validity is enforced; not authorization).
        const intent = (await import("../../shared/contracts/index.js")).Intent.parse(b.intent);
        const proposal = (await import("../../shared/contracts/index.js")).ActionProposal.parse(b.proposal);
        const assessment = (await import("../../shared/contracts/index.js")).SecurityAssessment.parse(b.security_assessment);

        // (1) Deterministic orchestration -> decision context (fails closed on any
        // missing/invalid authoritative input).
        const context = await c.orchestrator.orchestrate({
          companyId: auth.companyId,
          agentId: b.agent_id,
          intent,
          proposal,
          securityAssessment: assessment,
          traceId: b.trace_id,
          assessmentMaxAgeMs: b.assessment_max_age_ms,
          requireSimulation: b.require_simulation,
        });

        // (2) Deterministic decision from the orchestration result. Policy status is the
        // authority; the AI advisory can only raise scrutiny, never authorize.
        const decisionOut = c.decisionEngine.decide({
          agentActive: true, // orchestrator already required ACTIVE agent (else it threw)
          intentValid: true,
          capabilityValid: true,
          constitutionCompatible: true,
          policyEvaluation: {
            status: context.policyEvaluation.status,
            policy_id: context.policyEvaluation.policy_id,
            policy_version: context.policyEvaluation.policy_version,
            evaluation_hash: context.policyEvaluation.evaluation_hash,
          },
          approval: { required: false },
          aiRecommendedHandling: assessment.overall_assessment.recommended_handling,
        });

        // (3) Context hash + persist immutably.
        const contextHash = c.decisionEngine.contextHash({
          intentId: intent.intent_id,
          proposalId: proposal.proposal_id,
          policyId: context.policyEvaluation.policy_id,
          policyVersion: context.policyEvaluation.policy_version,
          policyEvaluationHash: context.policyEvaluation.evaluation_hash,
          securityAssessmentId: assessment.assessment_id,
          transactionId: null,
          transactionPayloadHash: null,
          simulationId: null,
          approvalContextHash: null,
        });
        const decision = await c.decision.record({
          companyId: auth.companyId,
          agentId: b.agent_id,
          intentId: intent.intent_id,
          proposalId: proposal.proposal_id,
          policyId: context.policyEvaluation.policy_id,
          policyVersionId: context.policyVersionId,
          securityAssessmentId: assessment.assessment_id,
          output: decisionOut,
          decisionContextHash: contextHash,
        });
        emitEvent(req, "decision.created", { decision_id: decision.id, result: decisionOut.result });

        // (4) REVIEW -> create a PENDING approval bound to this exact context.
        let approvalId: string | undefined;
        if (decisionOut.result === "REVIEW") {
          const approval = await c.approval.createRequest({
            companyId: auth.companyId,
            agentId: b.agent_id,
            decisionId: decision.id,
            requiredRole: "AUTHORIZED_OPERATOR",
            summary: { reasons: decisionOut.reasons },
            contextHash,
            expiresAt: new Date(Date.now() + 15 * 60_000),
          });
          approvalId = approval.id;
          emitEvent(req, "approval.requested", { approval_id: approval.id, decision_id: decision.id });
        }

        reply.code(201);
        return ok(req, { decision, result: decisionOut.result, context_hash: contextHash, approval_id: approvalId });
      });

      // ---- Approvals ---------------------------------------------------- //
      v1.get("/approvals", async (req) => {
        const auth = requireAuth(req);
        const p = parsePagination(req.query as Record<string, unknown>);
        const [rows, total] = await Promise.all([
          c.db.approvalRequest.findMany({ where: { companyId: auth.companyId }, orderBy: { createdAt: "desc" }, skip: p.skip, take: p.take }),
          c.db.approvalRequest.count({ where: { companyId: auth.companyId } }),
        ]);
        return ok(req, rows, pageMeta(p, total));
      });

      v1.get<{ Params: Params }>("/approvals/:id", async (req) => {
        const auth = requireAuth(req);
        const approval = await c.approval.getRequest(auth.companyId, req.params.id);
        if (!approval) throw CoreError.of("APPROVAL_NOT_FOUND", "Approval not found.");
        return ok(req, approval);
      });

      v1.post<{ Params: Params }>("/approvals/:id/approve", async (req) => {
        const auth = requireAuth(req);
        const b = body<{ context_hash: string }>(req);
        const result = await c.approval.approve(
          auth.companyId,
          req.params.id,
          { approverId: auth.actorId, companyId: auth.companyId, role: auth.actorRole },
          b.context_hash,
        );
        emitEvent(req, "approval.completed", { approval_id: req.params.id, result: "APPROVED" });
        return ok(req, result);
      });

      v1.post<{ Params: Params }>("/approvals/:id/deny", async (req) => {
        const auth = requireAuth(req);
        const result = await c.approval.deny(auth.companyId, req.params.id, {
          approverId: auth.actorId,
          companyId: auth.companyId,
          role: auth.actorRole,
        });
        emitEvent(req, "approval.completed", { approval_id: req.params.id, result: "DENIED" });
        return ok(req, result);
      });

      // ---- Executions --------------------------------------------------- //

      /**
       * Prepare an execution — the ONLY sanctioned path to an ExecutionRequest. Runs
       * FinalRevalidationService, which re-derives the decision at execution time
       * (agent/capability/policy/simulation/approval/context/budget) and, only if still
       * ALLOW, reserves budget (held, not committed) and mints an ExecutionRequest. There
       * is no /v1/execute or raw bypass; execution results arrive via the executor.
       */
      v1.post("/executions/prepare", async (req, reply) => {
        const auth = requireAuth(req);
        requireRole(auth, ["ADMIN", "AUTHORIZED_OPERATOR", "SERVICE"]);
        const b = body<{
          agent_id: string;
          decision_id: string;
          intent: unknown;
          proposal: unknown;
          security_assessment: unknown;
          transaction_id: string;
          analysis: unknown;
          expected_network: string;
          actual_network: string;
          simulation: unknown;
          simulated_payload_hash: string;
          approval_id?: string;
          decision_context_hash: string;
          financial_scope_key: string;
          asset: string;
          amount: string;
          assessment_max_age_ms?: number;
          require_simulation?: boolean;
        }>(req);

        const contracts = await import("../../shared/contracts/index.js");
        const outcome = await c.finalRevalidation.revalidate({
          companyId: auth.companyId,
          agentId: b.agent_id,
          decisionId: b.decision_id,
          intent: contracts.Intent.parse(b.intent),
          proposal: contracts.ActionProposal.parse(b.proposal),
          securityAssessment: contracts.SecurityAssessment.parse(b.security_assessment),
          transactionId: b.transaction_id,
          analysis: contracts.TransactionAnalysis.parse(b.analysis),
          expectedNetwork: b.expected_network,
          actualNetwork: b.actual_network,
          simulation: contracts.SimulationResult.parse(b.simulation),
          simulatedPayloadHash: b.simulated_payload_hash,
          approvalId: b.approval_id ?? null,
          decisionContextHash: b.decision_context_hash,
          financialScopeKey: b.financial_scope_key,
          asset: b.asset,
          amount: b.amount,
          assessmentMaxAgeMs: b.assessment_max_age_ms,
          simulationRequired: b.require_simulation,
        });

        if (outcome.result !== "ALLOW") {
          // A blocked execution is a structured, non-2xx security outcome.
          throw CoreError.of("EXECUTION_BLOCKED", `Execution not authorized: ${outcome.determinant}.`, {
            details: { determinant: outcome.determinant, reasons: outcome.reasons },
          });
        }
        emitEvent(req, "execution.requested", { execution_id: outcome.executionRequest?.id, decision_id: b.decision_id });
        reply.code(201);
        return ok(req, { execution_request: outcome.executionRequest, reservation_id: outcome.reservationId });
      });

      v1.get("/executions", async (req) => {
        const auth = requireAuth(req);
        const p = parsePagination(req.query as Record<string, unknown>);
        const [rows, total] = await Promise.all([
          c.db.executionRequestRecord.findMany({ where: { companyId: auth.companyId }, orderBy: { createdAt: "desc" }, skip: p.skip, take: p.take }),
          c.db.executionRequestRecord.count({ where: { companyId: auth.companyId } }),
        ]);
        return ok(req, rows, pageMeta(p, total));
      });

      v1.get<{ Params: Params }>("/executions/:id", async (req) => {
        const auth = requireAuth(req);
        const request = await c.executionResult.getRequest(auth.companyId, req.params.id);
        if (!request) throw CoreError.of("NOT_FOUND", "Execution not found.");
        return ok(req, request);
      });

      v1.get<{ Params: Params }>("/executions/:id/verification", async (req) => {
        const auth = requireAuth(req);
        const request = await c.executionResult.getRequest(auth.companyId, req.params.id);
        if (!request) throw CoreError.of("NOT_FOUND", "Execution not found.");
        const verifications = await c.db.receiptVerificationRecord.findMany({ where: { executionRequestId: request.id } });
        return ok(req, verifications);
      });

      // Reconcile an UNKNOWN execution (no blind retry; reservation stays held until resolved).
      v1.post<{ Params: Params }>("/executions/:id/reconcile", async (req) => {
        const auth = requireAuth(req);
        const outcome = await c.executionResult.reconcile(auth.companyId, req.params.id);
        emitEvent(req, "execution.reconciled", { execution_id: req.params.id, outcome: outcome.status });
        return ok(req, outcome);
      });

      // Ingest an execution result from the authenticated executor (Person 4).
      v1.post<{ Params: Params }>("/executions/:id/result", async (req) => {
        const auth = requireAuth(req);
        requireRole(auth, ["ADMIN", "SERVICE", "EXECUTOR"]);
        const b = body<{ status: "SUBMITTED" | "CONFIRMED" | "FAILED" | "UNKNOWN"; chain: string; transaction_hash?: string }>(req);
        const record = await c.executionResult.ingestResult(auth.companyId, {
          executionId: req.params.id,
          status: b.status,
          chain: b.chain,
          transactionHash: b.transaction_hash ?? null,
          authenticated: true,
        });
        emitEvent(req, "execution.result", { execution_id: req.params.id, status: b.status });
        return ok(req, record);
      });

      // Verify actual vs authorized + finalize financial state (commit on verified success).
      v1.post<{ Params: Params }>("/executions/:id/verify", async (req) => {
        const auth = requireAuth(req);
        requireRole(auth, ["ADMIN", "SERVICE", "EXECUTOR"]);
        const b = body<{ authorized: { recipient: string; asset: string; amount: string; network: string } }>(req);
        const result = await c.executionResult.verifyAndFinalize(auth.companyId, req.params.id, b.authorized);
        emitEvent(req, "verification.completed", { execution_id: req.params.id, status: result.verification.status });
        return ok(req, result);
      });

      // ---- Audit / Forensics / Attestation ------------------------------ //
      v1.get<{ Params: ExecParams }>("/audit/:executionId", async (req) => {
        const auth = requireAuth(req);
        const events = await c.audit.getEntityTimeline(auth.companyId, "EXECUTION", req.params.executionId);
        return ok(req, events);
      });

      v1.get<{ Params: ExecParams }>("/audit/:executionId/timeline", async (req) => {
        const auth = requireAuth(req);
        const events = await c.audit.getEntityTimeline(auth.companyId, "EXECUTION", req.params.executionId);
        const intact = await c.audit.verifyChain(auth.companyId, "EXECUTION", req.params.executionId);
        return ok(req, { events, chain_intact: intact });
      });

      v1.get<{ Params: ExecParams }>("/forensics/:executionId", async (req) => {
        const auth = requireAuth(req);
        const record = await c.forensic.reconstruct(auth.companyId, req.params.executionId);
        if (!record) throw CoreError.of("NOT_FOUND", "No forensic record for this execution.");
        return ok(req, record);
      });

      v1.get<{ Params: ExecParams }>("/attestations/:executionId", async (req) => {
        const auth = requireAuth(req);
        const rows = await c.db.attestationRecord.findMany({
          where: { companyId: auth.companyId, executionRequestId: req.params.executionId },
        });
        return ok(req, rows);
      });
    },
    { prefix: "/v1" },
  );
}
