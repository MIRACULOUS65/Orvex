/**
 * Decision Engine — Phase 10 (Tasks 10.1-10.6).
 *
 * The highest-trust deterministic component: it converts a fully-assembled authoritative
 * context into exactly one of ALLOW / REVIEW / DENY. It is a pure function of its inputs
 * — no I/O, no AI inference, no wall-clock reads (time is supplied). This is where
 * authorization legitimately lives; the SecurityAssessment is advisory only and can
 * NEVER directly produce ALLOW.
 *
 * Deterministic precedence (plan §10.2). Higher-priority hard failures can never be
 * overridden by lower-priority signals (including any AI verdict or a human approval):
 *   1. platform security invariant
 *   2. invalid capability / authority
 *   3. hard policy violation (PolicyEvaluation FAIL)
 *   4. invalid transaction / proposal-transaction mismatch
 *   5. mandatory simulation failure / stale simulation / wrong-transaction binding
 *   6. expired / stale context
 *   7. required human approval (absent/pending/denied/expired/mismatch)
 *   8. policy-defined risk review
 *   9. ALLOW
 *
 * The decision context hash (§10.6) binds the material inputs so an identical context
 * hashes identically and any material change yields a different hash.
 */
import { sha256Json } from "../shared/hash.js";
import type {
  PolicyEvaluationOut,
} from "../policy/index.js";
import type {
  SimulationBindingResult,
  SimulationOutcome,
  TransactionGateResult,
} from "../execution-gate/index.js";

export type DecisionResult = "ALLOW" | "REVIEW" | "DENY";

/** Approval state fed into the decision (Phase 11 supplies real values). */
export type ApprovalState =
  | { required: false }
  | { required: true; status: "NONE" | "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" | "MISMATCH" };

export interface DecisionInput {
  /** Platform-level hard invariant already violated (e.g. kill-switch). */
  platformInvariantViolated?: boolean;

  /** Authoritative authority state. */
  agentActive: boolean;
  intentValid: boolean;
  capabilityValid: boolean; // active + not expired
  constitutionCompatible: boolean;

  /** Deterministic policy evaluation (Phase 4/8). */
  policyEvaluation: Pick<PolicyEvaluationOut, "status" | "policy_id" | "policy_version" | "evaluation_hash">;

  /** Transaction gate result (Phase 9). Optional when no concrete transaction yet. */
  transactionGate?: TransactionGateResult;

  /** Simulation handling (Phase 9). */
  simulationRequired?: boolean;
  simulationOutcome?: SimulationOutcome;
  simulationBinding?: SimulationBindingResult;

  /** Context freshness. */
  contextStale?: boolean;

  /** Approval state (Phase 11). */
  approval: ApprovalState;

  /**
   * Advisory AI signal. Carried for the RECORD only; it can raise scrutiny (REVIEW) but
   * can NEVER produce ALLOW and can NEVER downgrade a DENY. `recommendedHandling` is the
   * advisory verb from the SecurityAssessment.
   */
  aiRecommendedHandling?: "PROCEED_CANDIDATE" | "MONITOR" | "REVIEW" | "DENY_RECOMMENDED";
}

export interface DecisionOutput {
  result: DecisionResult;
  reasons: string[];
  /** The deterministic precedence rule that produced the result. */
  determinant: string;
}

/** Material context used to derive the decision context hash (§10.6). */
export interface DecisionHashContext {
  intentId: string;
  proposalId: string;
  policyId: string;
  policyVersion: number;
  policyEvaluationHash: string;
  securityAssessmentId: string;
  transactionId: string | null;
  transactionPayloadHash: string | null;
  simulationId: string | null;
  approvalContextHash: string | null;
}

export class DecisionEngine {
  /**
   * Evaluate the decision deterministically. Returns the first (highest-priority)
   * outcome per the precedence ladder. Never reads AI as authority.
   */
  decide(input: DecisionInput): DecisionOutput {
    const reasons: string[] = [];

    // 1. Platform security invariant.
    if (input.platformInvariantViolated) {
      return deny("Platform security invariant violated.", "platform_invariant");
    }

    // 2. Invalid capability / authority.
    if (!input.agentActive) return deny("Agent is not active.", "agent_inactive");
    if (!input.intentValid) return deny("Intent is not valid.", "intent_invalid");
    if (!input.constitutionCompatible) {
      return deny("Constitution is not compatible.", "constitution_incompatible");
    }
    if (!input.capabilityValid) {
      return deny("Capability is invalid or expired.", "capability_invalid");
    }

    // 3. Hard policy violation.
    if (input.policyEvaluation.status === "FAIL") {
      return deny("Deterministic policy evaluation failed (hard violation).", "policy_violation");
    }

    // 4. Invalid transaction / proposal-transaction mismatch.
    if (input.transactionGate && input.transactionGate.status === "MISMATCH") {
      return deny(
        `Transaction does not match proposal: ${input.transactionGate.mismatches
          .map((m) => m.field)
          .join(", ")}.`,
        "transaction_mismatch",
      );
    }

    // 5. Simulation: binding + mandatory outcome.
    if (input.simulationBinding && input.simulationBinding.status !== "VALID") {
      return deny(
        `Simulation binding invalid: ${input.simulationBinding.status}.`,
        "simulation_binding_invalid",
      );
    }
    if (input.simulationOutcome === "DENY") {
      return deny("Simulation indicates the transaction would fail.", "simulation_deny");
    }
    if (input.simulationRequired) {
      if (input.simulationOutcome === undefined || input.simulationOutcome === "FAIL_CLOSED") {
        return deny("Mandatory simulation is missing or errored (fail closed).", "simulation_required");
      }
    }

    // 6. Expired / stale context.
    if (input.contextStale) {
      return deny("Authorization context is stale.", "context_stale");
    }

    // 7. Required human approval.
    if (input.approval.required) {
      switch (input.approval.status) {
        case "APPROVED":
          break; // proceed to lower-priority checks
        case "DENIED":
          return deny("Human approval was denied.", "approval_denied");
        case "EXPIRED":
          return deny("Required approval has expired.", "approval_expired");
        case "MISMATCH":
          return deny("Approval context does not match current context.", "approval_mismatch");
        case "PENDING":
        case "NONE":
        default:
          return review("Human approval is required.", "approval_required");
      }
    }

    // Simulation REVIEW (unexpected state change) surfaces as a review signal.
    if (input.simulationOutcome === "REVIEW") {
      reasons.push("Simulation reported an unexpected state change.");
    }

    // 8. Policy-defined risk review (PolicyEvaluation REVIEW) or advisory escalation.
    if (input.policyEvaluation.status === "REVIEW") {
      return review("Policy requires human review.", "policy_review");
    }
    if (input.aiRecommendedHandling === "DENY_RECOMMENDED" || input.aiRecommendedHandling === "REVIEW") {
      // Advisory can only RAISE scrutiny, never authorize. It maps to REVIEW, not DENY,
      // so a human decides (AI is not authority to hard-deny either).
      return review("AI advisory recommends elevated review.", "ai_advisory_review");
    }
    if (reasons.length > 0) {
      return { result: "REVIEW", reasons, determinant: "simulation_review" };
    }

    // 9. ALLOW — all required conditions satisfied.
    return {
      result: "ALLOW",
      reasons: ["All deterministic authorization conditions satisfied."],
      determinant: "allow",
    };
  }

  /**
   * Deterministic decision context hash (§10.6). Same canonical context -> same hash;
   * any material change -> different hash. Excludes cosmetic ids not part of authority.
   */
  contextHash(ctx: DecisionHashContext): string {
    return sha256Json({
      intentId: ctx.intentId,
      proposalId: ctx.proposalId,
      policyId: ctx.policyId,
      policyVersion: ctx.policyVersion,
      policyEvaluationHash: ctx.policyEvaluationHash,
      securityAssessmentId: ctx.securityAssessmentId,
      transactionId: ctx.transactionId,
      transactionPayloadHash: ctx.transactionPayloadHash,
      simulationId: ctx.simulationId,
      approvalContextHash: ctx.approvalContextHash,
    });
  }
}

function deny(reason: string, determinant: string): DecisionOutput {
  return { result: "DENY", reasons: [reason], determinant };
}

function review(reason: string, determinant: string): DecisionOutput {
  return { result: "REVIEW", reasons: [reason], determinant };
}
