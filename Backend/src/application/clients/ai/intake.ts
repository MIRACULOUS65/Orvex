/**
 * AI intake validation — Phase 7, Tasks 7.3/7.4/7.5/7.6.
 *
 * The Backend must NOT trust an AI response merely because it is structurally valid
 * (schema validity is not authorization). Beyond Zod schema validation (done in the
 * client), these deterministic checks confirm that an Intent / ActionProposal /
 * SecurityAssessment is genuinely bound to the entities Core is evaluating, is fresh,
 * and is not stale relative to the inputs that produced it.
 *
 * Staleness (Task 7.6): a SecurityAssessment is only usable if it was produced for the
 * exact proposal under evaluation AND the material inputs (amount / recipient / asset /
 * network) have not changed since. If a material field changed, the assessment is stale
 * and must be refreshed or the caller must enter the safe configured state — never
 * silently reused.
 */
import type { Intent, ActionProposal, SecurityAssessment } from "../../../shared/contracts/index.js";
import { CoreError } from "../../../shared/errors/index.js";

export interface IntentBinding {
  companyId: string;
  agentId: string;
}

/** Validate an Intent's binding, status, and expiry against the authoritative agent. */
export function validateIntentIntake(
  intent: Intent,
  binding: IntentBinding,
  now: Date = new Date(),
): void {
  if (intent.agent_id !== binding.agentId) {
    throw CoreError.of("INTENT_INVALID", "Intent agent does not match the authoritative agent.", {
      details: { intentAgent: intent.agent_id, expected: binding.agentId },
    });
  }
  if (intent.status === "EXPIRED" || intent.status === "INVALID") {
    throw CoreError.of("INTENT_INVALID", "Intent is not in a usable status.", {
      details: { status: intent.status },
    });
  }
  const validUntil = new Date(intent.valid_until);
  if (Number.isFinite(validUntil.getTime()) && validUntil.getTime() <= now.getTime()) {
    throw CoreError.of("INTENT_EXPIRED", "Intent has expired.", {
      details: { validUntil: intent.valid_until },
    });
  }
}

export interface ProposalBinding {
  intentId: string;
  agentId: string;
  /** trace id the proposal must reference (from the authoritative trajectory). */
  traceEventIds?: string[];
}

/** Validate an ActionProposal's binding to its intent + agent. */
export function validateProposalIntake(proposal: ActionProposal, binding: ProposalBinding): void {
  if (proposal.intent_id !== binding.intentId) {
    throw CoreError.of("PROPOSAL_INVALID", "Proposal intent_id does not match.", {
      details: { proposalIntent: proposal.intent_id, expected: binding.intentId },
    });
  }
  if (proposal.agent_id !== binding.agentId) {
    throw CoreError.of("PROPOSAL_INVALID", "Proposal agent_id does not match.", {
      details: { proposalAgent: proposal.agent_id, expected: binding.agentId },
    });
  }
}

export interface AssessmentBinding {
  proposalId: string;
  /** Max age (ms) before an assessment is considered expired. */
  maxAgeMs?: number;
}

/**
 * Validate a SecurityAssessment's binding + freshness (Task 7.5/7.6):
 *   - it must reference the proposal under evaluation
 *   - it must not be older than maxAgeMs (freshness)
 * This deliberately does NOT read `recommended_handling` as an authorization — it only
 * checks provenance/binding/freshness.
 */
export function validateAssessmentBinding(
  assessment: SecurityAssessment,
  binding: AssessmentBinding,
  now: Date = new Date(),
): void {
  if (assessment.proposal_id !== binding.proposalId) {
    throw CoreError.of("SECURITY_ASSESSMENT_INVALID", "Assessment is for a different proposal.", {
      details: { assessmentProposal: assessment.proposal_id, expected: binding.proposalId },
    });
  }
  if (binding.maxAgeMs !== undefined) {
    const createdAt = new Date(assessment.created_at).getTime();
    if (!Number.isFinite(createdAt)) {
      throw CoreError.of("SECURITY_ASSESSMENT_INVALID", "Assessment has an invalid created_at.", {
        details: { createdAt: assessment.created_at },
      });
    }
    if (now.getTime() - createdAt > binding.maxAgeMs) {
      throw CoreError.of("SECURITY_ASSESSMENT_STALE", "SecurityAssessment is too old (expired).", {
        details: { createdAt: assessment.created_at, maxAgeMs: binding.maxAgeMs },
      });
    }
  }
}

/** The material fields of a proposal whose change invalidates a prior assessment. */
export interface MaterialInputs {
  amount?: string;
  recipient?: string;
  asset?: string;
  network?: string;
}

/** Extract the material inputs from an ActionProposal. */
export function materialInputsOf(proposal: ActionProposal): MaterialInputs {
  return {
    amount: proposal.amount?.value,
    recipient: proposal.recipient?.address ?? proposal.recipient?.identifier ?? undefined,
    asset: proposal.amount?.currency,
    network: proposal.network ?? proposal.recipient?.network ?? undefined,
  };
}

/**
 * Stale-assessment detection: if any material input changed between the snapshot the
 * assessment was made against and the current proposal, the assessment is stale. Returns
 * true when stale (caller must refresh or enter safe state — never silently reuse).
 */
export function isAssessmentStale(previous: MaterialInputs, current: MaterialInputs): boolean {
  return (
    previous.amount !== current.amount ||
    previous.recipient !== current.recipient ||
    previous.asset !== current.asset ||
    previous.network !== current.network
  );
}

/**
 * Enforce non-staleness: throws SECURITY_ASSESSMENT_STALE if material inputs changed.
 * The safe behavior on stale intelligence is to refuse to reuse it.
 */
export function assertAssessmentCurrent(previous: MaterialInputs, current: MaterialInputs): void {
  if (isAssessmentStale(previous, current)) {
    throw CoreError.of(
      "SECURITY_ASSESSMENT_STALE",
      "Material inputs changed after the SecurityAssessment; must re-assess.",
      { details: { previous, current } },
    );
  }
}
