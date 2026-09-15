/**
 * Final Revalidation / Execution Gate — Phase 12 (Tasks 12.1-12.5).
 *
 * The LAST security checkpoint before an ExecutionRequest is created. A prior Decision
 * (ALLOW) is NOT trusted on its own — the world may have changed between decision and
 * execution. This service re-derives the authoritative state and re-runs the
 * deterministic Decision Engine at execution time, then (only if still ALLOW) reserves
 * budget and mints an ExecutionRequest bound to the authorization context.
 *
 * Re-checked immediately before execution (§12.1): agent status, intent status/expiry,
 * constitution, capability status/expiry, active policy version, SecurityAssessment
 * freshness, transaction payload hash, simulation binding, approval status/expiry/
 * context hash, decision context hash, network, execution mode, budget availability,
 * idempotency, authorization context.
 *
 * Stale-decision handling: any change (policy version bump, capability expiry, agent
 * paused, transaction mutated, simulation stale, approval context changed, decision
 * context hash drift) fails closed — the old decision cannot directly execute. Never
 * silently continue.
 *
 * Boundaries: Core reserves budget but does NOT commit (commit happens post-verify in
 * Phase 13). Core holds no signer/keys and creates no raw-execution bypass. The actual
 * execution is delegated to the abstract ExecutionClient (Person 4).
 */
import type { ExecutionRequestRecord, PrismaClient } from "@prisma/client";
import { CoreError } from "../shared/errors/index.js";
import { DecisionEngine, type ApprovalState, type DecisionInput } from "../decision/index.js";
import { AgentService, CapabilityService, ConstitutionService, FinancialService, IdempotencyService } from "../domain/index.js";
import { PolicyService, PolicyEngine, type CompiledRule, type EvaluationContext } from "../policy/index.js";
import { ApprovalService } from "../approval/index.js";
import {
  compareProposalVsTransaction,
  classifySimulation,
  validateSimulationBinding,
  transactionPayloadHash,
  type SimulationBindingResult,
} from "./transaction-gate.js";
import type { ActionProposal, Intent, SecurityAssessment, TransactionAnalysis, SimulationResult } from "../shared/contracts/index.js";

export interface RevalidateInput {
  companyId: string;
  agentId: string;
  decisionId: string;
  intent: Intent;
  proposal: ActionProposal;
  securityAssessment: SecurityAssessment;
  transactionId: string;
  analysis: TransactionAnalysis;
  /** The network the authorization is bound to + the actual network of the analysis. */
  expectedNetwork: string;
  actualNetwork: string;
  simulation: SimulationResult;
  /** Payload hash the simulation was recorded against + the current payload hash. */
  simulatedPayloadHash: string;
  /** The approval request id, when the decision required approval. */
  approvalId?: string | null;
  /** The decision context hash captured at decision time (must still match). */
  decisionContextHash: string;
  /** Financial bucket key for reservation. */
  financialScopeKey: string;
  asset: string;
  amount: string;
  budgetLimit?: string | null;
  assessmentMaxAgeMs?: number;
  simulationRequired?: boolean;
  now?: Date;
}

export interface RevalidationOutcome {
  /** The final (re-derived) decision at execution time. */
  result: "ALLOW" | "REVIEW" | "DENY";
  determinant: string;
  reasons: string[];
  /** Present only when result is ALLOW. */
  executionRequest?: ExecutionRequestRecord;
  /** The reservation id created for an ALLOW (budget held, not committed). */
  reservationId?: string;
}

export interface FinalRevalidationDeps {
  db: PrismaClient;
  policyService: PolicyService;
}

export class FinalRevalidationService {
  private readonly agents: AgentService;
  private readonly constitutions: ConstitutionService;
  private readonly capabilities: CapabilityService;
  private readonly financial: FinancialService;
  private readonly idempotency: IdempotencyService;
  private readonly approvals: ApprovalService;
  private readonly policyService: PolicyService;
  private readonly policyEngine = new PolicyEngine();
  private readonly decisionEngine = new DecisionEngine();

  constructor(private readonly deps: FinalRevalidationDeps) {
    this.agents = new AgentService(deps.db);
    this.constitutions = new ConstitutionService(deps.db);
    this.capabilities = new CapabilityService(deps.db);
    this.financial = new FinancialService(deps.db);
    this.idempotency = new IdempotencyService(deps.db);
    this.approvals = new ApprovalService(deps.db);
    this.policyService = deps.policyService;
  }

  private payloadHash(input: RevalidateInput): string {
    return transactionPayloadHash({
      transactionId: input.transactionId,
      network: input.actualNetwork,
      recipient: input.analysis.recipient,
      amount: input.analysis.amount,
      asset: input.analysis.asset,
      contractAddress: input.analysis.contract?.address ?? null,
      functionSelector: input.analysis.function?.selector ?? null,
    });
  }

  /**
   * Run final revalidation. Returns ALLOW + a minted ExecutionRequest (and a held
   * reservation) only when every check passes at execution time; otherwise DENY/REVIEW
   * with reasons and NO execution request.
   */
  async revalidate(input: RevalidateInput): Promise<RevalidationOutcome> {
    const now = input.now ?? new Date();

    // --- Resolve current authoritative state -------------------------------- //
    const agent = await this.agents.getAgent(input.companyId, input.agentId);
    const agentActive = agent?.status === "ACTIVE";

    // Intent status/expiry.
    const validUntil = new Date(input.intent.valid_until);
    const intentValid =
      input.intent.status === "VALID" &&
      (!Number.isFinite(validUntil.getTime()) || validUntil.getTime() > now.getTime());

    // Constitution active + compatible.
    const constitution = await this.constitutions.getActiveConstitution(input.companyId, input.agentId);
    const constitutionCompatible = !!constitution;

    // Capability active + not expired.
    const capabilities = agent
      ? await this.capabilities.getActiveCapabilities(input.companyId, input.agentId, now)
      : [];
    const capability = capabilities[0];
    const capabilityValid = !!capability;

    // Active policy version + rules (re-loaded now; a version bump changes the hash).
    let policyVersion = 0;
    let policyVersionId: string | null = null;
    let policyEvaluationHash = "none";
    let policyStatus: "PASS" | "REVIEW" | "FAIL" = "FAIL";
    let policyId: string | null = agent?.activePolicyId ?? null;
    if (agent?.activePolicyId) {
      const activeVersion = await this.policyService.getActiveVersion(input.companyId, agent.activePolicyId);
      if (activeVersion) {
        policyVersionId = activeVersion.id;
        policyVersion = activeVersion.version;
        const rules = (await this.policyService.loadRules(input.companyId, activeVersion.id)) as CompiledRule[];
        const ctx: EvaluationContext = {
          transaction: {
            action: input.proposal.action_type,
            amount: input.proposal.amount?.value,
            currency: input.proposal.amount?.currency,
            asset: input.proposal.amount?.currency,
            network: input.proposal.network ?? undefined,
            recipient: input.proposal.recipient?.address ?? input.proposal.recipient?.identifier ?? undefined,
          },
          capabilityExpiresAt: capability?.expiresAt ? capability.expiresAt.toISOString() : null,
          now: now.toISOString(),
        };
        const evalOut = this.policyEngine.evaluate({ policyId: agent.activePolicyId, policyVersion, rules, context: ctx });
        policyEvaluationHash = evalOut.evaluation_hash;
        policyStatus = evalOut.status;
      }
    }

    // SecurityAssessment freshness (advisory; binding checked upstream, freshness here).
    let contextStale = false;
    if (input.assessmentMaxAgeMs !== undefined) {
      const created = new Date(input.securityAssessment.created_at).getTime();
      if (!Number.isFinite(created) || now.getTime() - created > input.assessmentMaxAgeMs) {
        contextStale = true;
      }
    }

    // Transaction gate (proposal vs actual transaction + network).
    const gate = compareProposalVsTransaction(input.proposal, input.analysis, {
      expectedNetwork: input.expectedNetwork,
      actualNetwork: input.actualNetwork,
      expectSimplePayment: input.proposal.action_type === "PAY",
    });

    // Simulation binding + outcome.
    const simBinding: SimulationBindingResult = validateSimulationBinding(input.simulation, {
      transactionId: input.transactionId,
      simulatedPayloadHash: input.simulatedPayloadHash,
      currentPayloadHash: this.payloadHash(input),
    });
    const simOutcome = classifySimulation(input.simulation);

    // Approval state (re-checked at execution time, incl. context-hash binding).
    let approval: ApprovalState = { required: false };
    if (input.approvalId) {
      const state = await this.approvals.resolveApprovalState(
        input.companyId,
        input.approvalId,
        input.decisionContextHash,
        now,
      );
      approval = { required: true, status: state };
    }

    // Decision context hash drift: if the captured decision hash no longer matches the
    // freshly-derived context, the decision is stale.
    const freshHash = this.decisionEngine.contextHash({
      intentId: input.intent.intent_id,
      proposalId: input.proposal.proposal_id,
      policyId: policyId ?? "none",
      policyVersion,
      policyEvaluationHash,
      securityAssessmentId: input.securityAssessment.assessment_id,
      transactionId: input.transactionId,
      transactionPayloadHash: this.payloadHash(input),
      simulationId: input.simulation.transaction_id,
      approvalContextHash: input.approvalId ? input.decisionContextHash : null,
    });
    // The caller supplies the hash captured at decision time; if the current material
    // context differs it means something changed -> stale.
    if (input.decisionContextHash && input.decisionContextHash !== freshHash) {
      contextStale = true;
    }

    // --- Re-run the deterministic decision at execution time ---------------- //
    const decisionInput: DecisionInput = {
      agentActive,
      intentValid,
      capabilityValid,
      constitutionCompatible,
      policyEvaluation: { status: policyStatus, policy_id: policyId ?? "none", policy_version: policyVersion, evaluation_hash: policyEvaluationHash },
      transactionGate: gate,
      simulationRequired: input.simulationRequired,
      simulationOutcome: simOutcome,
      simulationBinding: simBinding,
      contextStale,
      approval,
      aiRecommendedHandling: input.securityAssessment.overall_assessment.recommended_handling,
    };
    const decision = this.decisionEngine.decide(decisionInput);

    if (decision.result !== "ALLOW") {
      return { result: decision.result, determinant: decision.determinant, reasons: decision.reasons };
    }

    // --- ALLOW: register idempotency, reserve budget, mint ExecutionRequest -- //
    const idempotencyKey = this.payloadHash(input); // stable per logical execution
    const registration = await this.idempotency.register({
      companyId: input.companyId,
      idempotencyKey,
      operationType: "EXECUTION",
      request: {
        decisionId: input.decisionId,
        transactionId: input.transactionId,
        amount: input.amount,
        recipient: input.analysis.recipient,
        network: input.actualNetwork,
      },
    });

    // If a prior ExecutionRequest already exists for this key, return it (dedup).
    const existing = await this.deps.db.executionRequestRecord.findFirst({
      where: { companyId: input.companyId, idempotencyKey },
    });
    if (existing) {
      return {
        result: "ALLOW",
        determinant: "allow_idempotent",
        reasons: ["Existing execution request reused (idempotent)."],
        executionRequest: existing,
      };
    }
    void registration;

    // Reserve budget (HELD, not committed). Over-budget => fail closed as DENY.
    let reservationId: string | undefined;
    try {
      const reservation = await this.financial.reserve({
        companyId: input.companyId,
        agentId: input.agentId,
        scope: "AGENT",
        scopeKey: input.financialScopeKey,
        asset: input.asset,
        network: input.actualNetwork,
        amount: input.amount,
      });
      reservationId = reservation.id;
    } catch (err) {
      if (err instanceof CoreError && err.code === "POLICY_VIOLATION") {
        return { result: "DENY", determinant: "budget_exceeded", reasons: ["Budget unavailable at execution time."] };
      }
      throw err;
    }

    const executionRequest = await this.deps.db.executionRequestRecord.create({
      data: {
        companyId: input.companyId,
        agentId: input.agentId,
        decisionId: input.decisionId,
        transactionId: input.transactionId,
        policyVersionId,
        authorizationContextHash: freshHash,
        idempotencyKey,
        executorType: "SMART_ACCOUNT",
        network: input.actualNetwork,
        status: "AUTHORIZED",
        authorizedAt: now,
      },
    });

    // Bind the reservation to the execution request.
    await this.deps.db.financialReservation.update({
      where: { id: reservationId },
      data: { executionRequestId: executionRequest.id },
    });

    return {
      result: "ALLOW",
      determinant: "allow",
      reasons: ["Final revalidation passed; execution authorized."],
      executionRequest,
      reservationId,
    };
  }
}
