/**
 * Intake service — Backend/Core product surface.
 *
 * Persists AI-layer artifacts (Intent, ActionProposal, SecurityAssessment) into Core's
 * durable store, validating each against its Phase 2 contract and enforcing tenant +
 * reference integrity. A proposal's `intent_id`/`agent_id` MUST reference entities that
 * exist within the SAME company (no arbitrary ids). A SecurityAssessment is stored as
 * INTELLIGENCE only — its `recommended_handling` is never treated as authorization.
 */
import type {
  ActionProposalRecord,
  IntentRecord,
  PrismaClient,
  SecurityAssessmentRecord,
} from "@prisma/client";
import {
  ActionProposal,
  Intent,
  SecurityAssessment,
} from "../shared/contracts/index.js";
import { CoreError } from "../shared/errors/index.js";
import { sha256Json } from "../shared/hash.js";

export class IntakeService {
  constructor(private readonly db: PrismaClient) {}

  // ---- Intent ---------------------------------------------------------- //

  async createIntent(companyId: string, payload: unknown): Promise<IntentRecord> {
    const parsed = Intent.safeParse(payload);
    if (!parsed.success) {
      throw CoreError.of("INVALID_INPUT", "Intent failed contract validation.", {
        details: { issues: parsed.error.issues.slice(0, 5) },
      });
    }
    const intent = parsed.data;
    // Agent must exist within the tenant.
    const agent = await this.db.agent.findFirst({ where: { id: intent.agent_id, companyId } });
    if (!agent) {
      throw CoreError.of("AGENT_NOT_FOUND", "Intent agent not found in this company.", {
        details: { agentId: intent.agent_id },
      });
    }
    return this.db.intentRecord.create({
      data: {
        companyId,
        agentId: intent.agent_id,
        schemaVersion: intent.schema_version,
        userGoal: intent.user_goal,
        purpose: intent.purpose,
        desiredOutcome: intent.desired_outcome,
        intentJson: intent as unknown as object,
        autonomyLevel: intent.autonomy_level,
        validFrom: new Date(intent.valid_from),
        validUntil: new Date(intent.valid_until),
        status: intent.status === "INVALID" ? "CANCELLED" : intent.status,
      },
    });
  }

  async getIntent(companyId: string, id: string): Promise<IntentRecord | null> {
    return this.db.intentRecord.findFirst({ where: { id, companyId } });
  }

  async listIntents(companyId: string, skip: number, take: number): Promise<{ rows: IntentRecord[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.db.intentRecord.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, skip, take }),
      this.db.intentRecord.count({ where: { companyId } }),
    ]);
    return { rows, total };
  }

  // ---- ActionProposal -------------------------------------------------- //

  async createProposal(companyId: string, payload: unknown): Promise<ActionProposalRecord> {
    const parsed = ActionProposal.safeParse(payload);
    if (!parsed.success) {
      throw CoreError.of("PROPOSAL_INVALID", "ActionProposal failed contract validation.", {
        details: { issues: parsed.error.issues.slice(0, 5) },
      });
    }
    const proposal = parsed.data;

    // Reference integrity: the intent must exist within the tenant and be bound to the
    // same agent (no arbitrary ids).
    const intent = await this.db.intentRecord.findFirst({
      where: { id: proposal.intent_id, companyId },
    });
    if (!intent) {
      throw CoreError.of("PROPOSAL_INVALID", "Proposal references an unknown intent.", {
        details: { intentId: proposal.intent_id },
      });
    }
    if (intent.agentId !== proposal.agent_id) {
      throw CoreError.of("PROPOSAL_INVALID", "Proposal agent does not match its intent's agent.", {
        details: { proposalAgent: proposal.agent_id, intentAgent: intent.agentId },
      });
    }

    return this.db.actionProposalRecord.create({
      data: {
        companyId,
        agentId: proposal.agent_id,
        intentId: proposal.intent_id,
        traceId: proposal.trajectory_event_ids?.[0] ?? null,
        schemaVersion: proposal.schema_version,
        actionType: proposal.action_type,
        purpose: proposal.purpose,
        proposalJson: proposal as unknown as object,
        paymentMethod: proposal.payment_method ?? null,
        network: proposal.network ?? null,
        evidenceRefsJson: (proposal.evidence_ids ?? []) as unknown as object,
        trajectoryRefsJson: (proposal.trajectory_event_ids ?? []) as unknown as object,
        status: "RECEIVED",
      },
    });
  }

  async getProposal(companyId: string, id: string): Promise<ActionProposalRecord | null> {
    return this.db.actionProposalRecord.findFirst({ where: { id, companyId } });
  }

  async listProposals(companyId: string, skip: number, take: number): Promise<{ rows: ActionProposalRecord[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.db.actionProposalRecord.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, skip, take }),
      this.db.actionProposalRecord.count({ where: { companyId } }),
    ]);
    return { rows, total };
  }

  // ---- SecurityAssessment (intelligence, NOT authority) ---------------- //

  async ingestAssessment(companyId: string, proposalId: string, payload: unknown): Promise<SecurityAssessmentRecord> {
    const parsed = SecurityAssessment.safeParse(payload);
    if (!parsed.success) {
      throw CoreError.of("SECURITY_ASSESSMENT_INVALID", "SecurityAssessment failed contract validation.", {
        details: { issues: parsed.error.issues.slice(0, 5) },
      });
    }
    const assessment = parsed.data;

    const proposal = await this.db.actionProposalRecord.findFirst({ where: { id: proposalId, companyId } });
    if (!proposal) {
      throw CoreError.of("PROPOSAL_INVALID", "Assessment references an unknown proposal.", {
        details: { proposalId },
      });
    }

    return this.db.securityAssessmentRecord.create({
      data: {
        companyId,
        agentId: proposal.agentId,
        proposalId,
        traceId: proposal.traceId,
        schemaVersion: assessment.schema_version,
        assessmentJson: assessment as unknown as object,
        overallStatus: assessment.overall_assessment.status,
        // Stored for the record only — NEVER used as an authorization signal.
        recommendedHandling: assessment.overall_assessment.recommended_handling,
        assessmentHash: sha256Json(assessment),
        modelMetadataJson: (assessment.model_metadata ?? null) as unknown as object,
      },
    });
  }

  async getLatestAssessment(companyId: string, proposalId: string): Promise<SecurityAssessmentRecord | null> {
    return this.db.securityAssessmentRecord.findFirst({
      where: { companyId, proposalId },
      orderBy: { createdAt: "desc" },
    });
  }
}
