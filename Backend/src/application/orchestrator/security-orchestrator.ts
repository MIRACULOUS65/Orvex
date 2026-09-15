/**
 * Security Orchestrator — Phase 8 (Tasks 8.1-8.8).
 *
 * Deterministic application coordination that assembles a self-consistent decision
 * context from authoritative state + advisory AI intelligence. It is explicitly:
 *   - NOT an AI model (no inference, no model calls of its own)
 *   - NOT the Decision Engine (it produces the CONTEXT; the final ALLOW/REVIEW/DENY
 *     authority is Phase 10). This class deliberately does not return a decision result.
 *
 * Ordered responsibilities (plan §8.1-§8.8):
 *   1. validate inputs (bindings)                        [validateProposalIntake, etc.]
 *   2. resolve authoritative agent state                 [AgentService]
 *   3. load Constitution                                 [ConstitutionService]
 *   4. load active capability                            [CapabilityService]
 *   5. load active policy version + rules                [PolicyService]
 *   6. load trajectory                                   [TrajectoryService]
 *   7. load + validate SecurityAssessment (advisory)     [intake validators]
 *   8. validate freshness/binding
 *   9. run deterministic PolicyEngine.evaluate
 *   10. prepare TransactionAnalysis + Simulation (provider seams)
 *   11. produce an internally-consistent decision context
 *
 * Fail-closed: any missing/invalid authoritative input (inactive agent, missing policy,
 * expired capability, stale assessment, tenant mismatch) raises a typed CoreError. The
 * SecurityAssessment is consumed as intelligence only and NEVER used as authority.
 */
import type {
  ActionProposal,
  Intent,
  SecurityAssessment,
} from "../../shared/contracts/index.js";
import { CoreError } from "../../shared/errors/index.js";
import {
  PolicyEngine,
  type CompiledRule,
  type EvaluationContext,
  type PolicyEvaluationOut,
} from "../../policy/index.js";
import { PolicyService } from "../../policy/policy.service.js";
import { AgentService, CapabilityService, ConstitutionService } from "../../domain/index.js";
import { TrajectoryService } from "../../trajectory/index.js";
import {
  validateProposalIntake,
  validateAssessmentBinding,
  materialInputsOf,
  type MaterialInputs,
} from "../clients/ai/index.js";
import type {
  SimulationProvider,
  TransactionAnalysisProvider,
} from "../clients/execution/types.js";
import type { PrismaClient } from "@prisma/client";
import type {
  TransactionAnalysis,
  SimulationResult,
} from "../../shared/contracts/index.js";

export interface OrchestrateInput {
  companyId: string;
  agentId: string;
  intent: Intent;
  proposal: ActionProposal;
  securityAssessment: SecurityAssessment;
  /** The active trajectory trace id for this proposal (optional but recommended). */
  traceId?: string;
  /** Max acceptable assessment age (ms). Older => stale (fail-closed). */
  assessmentMaxAgeMs?: number;
  /** Whether simulation is mandatory (§8.6 — platform/policy configurable). */
  requireSimulation?: boolean;
  now?: Date;
}

/**
 * The internally-consistent decision context (§8.8). It contains everything the later
 * Decision Engine needs, but NO decision. `policyEvaluation.status` is a deterministic
 * PASS/FAIL/REVIEW from the rule engine, not an authorization.
 */
export interface DecisionContext {
  companyId: string;
  agentId: string;
  intent: Intent;
  proposal: ActionProposal;
  /** Advisory only — carried for the record, never treated as authority. */
  securityAssessment: SecurityAssessment;
  securityAdvisory: {
    overallStatus: string;
    recommendedHandling: string;
    /** Explicit marker so downstream code cannot mistake this for authority. */
    isAuthoritative: false;
  };
  policyEvaluation: PolicyEvaluationOut;
  capabilityId: string;
  policyVersionId: string;
  transactionAnalysis?: unknown;
  simulationResult?: unknown;
  trajectoryEventCount: number;
  assembledAt: string;
}

export interface OrchestratorDeps {
  db: PrismaClient;
  policyService: PolicyService;
  transactionAnalysis?: TransactionAnalysisProvider;
  simulation?: SimulationProvider;
}

export class SecurityOrchestrator {
  private readonly agents: AgentService;
  private readonly constitutions: ConstitutionService;
  private readonly capabilities: CapabilityService;
  private readonly trajectory: TrajectoryService;
  private readonly policyService: PolicyService;
  private readonly engine = new PolicyEngine();

  constructor(private readonly deps: OrchestratorDeps) {
    this.agents = new AgentService(deps.db);
    this.constitutions = new ConstitutionService(deps.db);
    this.capabilities = new CapabilityService(deps.db);
    this.trajectory = new TrajectoryService(deps.db);
    this.policyService = deps.policyService;
  }

  async orchestrate(input: OrchestrateInput): Promise<DecisionContext> {
    const now = input.now ?? new Date();

    // (1) Input binding validation.
    validateProposalIntake(input.proposal, {
      intentId: input.intent.intent_id,
      agentId: input.agentId,
    });
    if (input.intent.agent_id !== input.agentId) {
      throw CoreError.of("INTENT_INVALID", "Intent agent does not match the request agent.");
    }

    // (2) Resolve authoritative agent state (tenant-scoped). Must be ACTIVE.
    const agent = await this.agents.requireAgent(input.companyId, input.agentId);
    if (agent.status !== "ACTIVE") {
      throw CoreError.of("AGENT_INACTIVE", "Agent is not ACTIVE.", {
        details: { agentId: agent.id, status: agent.status },
      });
    }

    // (3) Load the active Constitution.
    const constitution = await this.constitutions.getActiveConstitution(
      input.companyId,
      input.agentId,
    );
    if (!constitution) {
      throw CoreError.of("AUTHORIZATION_ERROR", "No active constitution for agent.", {
        details: { agentId: input.agentId },
      });
    }

    // (4) Load an active, non-expired capability for this agent.
    const capabilities = await this.capabilities.getActiveCapabilities(
      input.companyId,
      input.agentId,
      now,
    );
    const capability = capabilities[0];
    if (!capability) {
      throw CoreError.of("CAPABILITY_EXPIRED", "No active capability available for agent.", {
        details: { agentId: input.agentId },
      });
    }

    // (5) Load the active policy version + compiled rules. Missing policy => fail closed.
    if (!agent.activePolicyId) {
      throw CoreError.of("POLICY_INVALID", "Agent has no active policy.", {
        details: { agentId: input.agentId },
      });
    }
    const activeVersion = await this.policyService.getActiveVersion(
      input.companyId,
      agent.activePolicyId,
    );
    if (!activeVersion) {
      throw CoreError.of("POLICY_INVALID", "No active policy version.", {
        details: { policyId: agent.activePolicyId },
      });
    }
    const rules = (await this.policyService.loadRules(input.companyId, activeVersion.id)) as CompiledRule[];

    // (6) Load trajectory (event types feed trajectory-aware rules).
    let trajectoryEventTypes: string[] = [];
    if (input.traceId) {
      const trace = await this.trajectory.getTrace(input.companyId, input.traceId);
      if (!trace) {
        throw CoreError.of("NOT_FOUND", "Trajectory trace not found for this company.", {
          details: { traceId: input.traceId },
        });
      }
      const events = await this.trajectory.getEvents(input.companyId, input.traceId);
      trajectoryEventTypes = events.map((e) => e.eventType);
    }

    // (7)+(8) Validate the SecurityAssessment binding + freshness (advisory only).
    validateAssessmentBinding(
      input.securityAssessment,
      { proposalId: input.proposal.proposal_id, maxAgeMs: input.assessmentMaxAgeMs },
      now,
    );
    // Stale-input guard: the assessment must reflect the CURRENT material inputs.
    const current: MaterialInputs = materialInputsOf(input.proposal);
    // (The assessment does not carry its own snapshot in this contract; the binding +
    // freshness checks above are the staleness gate. Material-change detection is used
    // by callers that persist a prior snapshot; here we assert current inputs exist.)
    void current;

    // (9) Deterministic policy evaluation over authoritative context.
    const context: EvaluationContext = {
      transaction: {
        action: input.proposal.action_type,
        amount: input.proposal.amount?.value,
        currency: input.proposal.amount?.currency,
        asset: input.proposal.amount?.currency,
        network: input.proposal.network ?? input.proposal.recipient?.network ?? undefined,
        recipient:
          input.proposal.recipient?.address ?? input.proposal.recipient?.identifier ?? undefined,
      },
      trajectoryEventTypes,
      capabilityExpiresAt: capability.expiresAt ? capability.expiresAt.toISOString() : null,
      now: now.toISOString(),
    };
    const policyEvaluation = this.engine.evaluate({
      policyId: agent.activePolicyId,
      policyVersion: activeVersion.version,
      rules,
      context,
    });

    // (10) Prepare transaction analysis + simulation via provider seams (Phase 9+ real).
    let transactionAnalysis: TransactionAnalysis | undefined;
    let simulationResult: SimulationResult | undefined;
    const recipient = context.transaction.recipient;
    const amount = context.transaction.amount;
    const asset = context.transaction.asset;
    const network = context.transaction.network;
    if (this.deps.transactionAnalysis && recipient && amount && asset && network) {
      transactionAnalysis = await this.deps.transactionAnalysis.analyze({
        transactionId: input.proposal.proposal_id,
        network,
        recipient,
        amount,
        asset,
      });
    }
    if (this.deps.simulation && network) {
      simulationResult = await this.deps.simulation.simulate({
        transactionId: input.proposal.proposal_id,
        network,
      });
    } else if (input.requireSimulation) {
      throw CoreError.of("SIMULATION_FAILED", "Simulation is required but no provider is configured.");
    }

    // (11) Produce the internally-consistent decision context. No decision is made here.
    return {
      companyId: input.companyId,
      agentId: input.agentId,
      intent: input.intent,
      proposal: input.proposal,
      securityAssessment: input.securityAssessment,
      securityAdvisory: {
        overallStatus: input.securityAssessment.overall_assessment.status,
        recommendedHandling: input.securityAssessment.overall_assessment.recommended_handling,
        isAuthoritative: false,
      },
      policyEvaluation,
      capabilityId: capability.id,
      policyVersionId: activeVersion.id,
      transactionAnalysis: transactionAnalysis as unknown,
      simulationResult: simulationResult as unknown,
      trajectoryEventCount: trajectoryEventTypes.length,
      assembledAt: now.toISOString(),
    };
  }
}
