/**
 * Decision persistence — Phase 10 (Task 10, BACKEND_DATABASE.md §35/§36).
 *
 * Persists the authoritative Decision, referencing the EXACT inputs that produced it
 * (policy version, security assessment, transaction, simulation, approval when present)
 * plus the deterministic decision context hash. Decisions are append-only/versioned:
 * a re-evaluation because context changed creates a NEW decision row; historical
 * decisions are never rewritten (no ALLOW->DENY mutation of the same record).
 */
import type { Decision, PrismaClient } from "@prisma/client";
import type { DecisionOutput } from "./engine.js";

export interface PersistDecisionInput {
  companyId: string;
  agentId: string;
  intentId: string;
  proposalId: string;
  policyId?: string | null;
  policyVersionId?: string | null;
  securityAssessmentId?: string | null;
  transactionId?: string | null;
  simulationResultId?: string | null;
  approvalRequestId?: string | null;
  output: DecisionOutput;
  decisionContextHash: string;
}

export class DecisionService {
  constructor(private readonly db: PrismaClient) {}

  /** Persist a new (immutable) decision row. */
  async record(input: PersistDecisionInput): Promise<Decision> {
    return this.db.decision.create({
      data: {
        companyId: input.companyId,
        agentId: input.agentId,
        intentId: input.intentId,
        proposalId: input.proposalId,
        policyId: input.policyId ?? null,
        policyVersionId: input.policyVersionId ?? null,
        securityAssessmentId: input.securityAssessmentId ?? null,
        transactionId: input.transactionId ?? null,
        simulationResultId: input.simulationResultId ?? null,
        approvalRequestId: input.approvalRequestId ?? null,
        result: input.output.result,
        reasonsJson: input.output.reasons as unknown as object,
        determinant: input.output.determinant,
        decisionContextHash: input.decisionContextHash,
        version: 1,
      },
    });
  }

  async getDecision(companyId: string, decisionId: string): Promise<Decision | null> {
    return this.db.decision.findFirst({ where: { id: decisionId, companyId } });
  }
}
