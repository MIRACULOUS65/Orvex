/**
 * Policy lifecycle service — Phase 4, Tasks 4.1 / 4.2.
 *
 * Owns policy identity (Policy) and its immutable versions (PolicyVersion). The AI
 * layer may produce a candidate rule set, but ONLY this deterministic Core service can
 * move a version through its lifecycle and activate it (Requirement 7.5).
 *
 * Version lifecycle (plan §4.2 / BACKEND_DATABASE.md §14):
 *   DRAFT -> VALIDATING -> SIMULATED -> APPROVED -> ACTIVE -> SUPERSEDED / DISABLED
 *
 * Immutability (§16, batch requirement): once a version is ACTIVE its compiled rule set
 * is never mutated. A change creates a NEW version. Activating a new version supersedes
 * the previously-active one, atomically, so a policy has exactly one ACTIVE version.
 */
import type { Policy, PolicyVersion, PolicyVersionStatus, PrismaClient } from "@prisma/client";
import { CoreError } from "../shared/errors/index.js";
import { sha256Json } from "../shared/hash.js";
import type { CompiledRule } from "./rules/types.js";
import { validateCompiledRules } from "./rules/types.js";

/** Allowed forward transitions for a policy version (deterministic state machine). */
const VERSION_TRANSITIONS: Record<PolicyVersionStatus, PolicyVersionStatus[]> = {
  DRAFT: ["VALIDATING", "DISABLED"],
  VALIDATING: ["SIMULATED", "DRAFT", "DISABLED"],
  SIMULATED: ["APPROVED", "DRAFT", "DISABLED"],
  APPROVED: ["ACTIVE", "DISABLED"],
  ACTIVE: ["SUPERSEDED", "DISABLED"],
  SUPERSEDED: [],
  DISABLED: [],
};

export interface CreateDraftInput {
  companyId: string;
  agentId?: string | null;
  name: string;
  description?: string;
  rules: CompiledRule[];
  sourceType?: string;
  sourceReference?: string;
  createdBy?: string;
}

export class PolicyService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Create a new DRAFT policy version. If no policy with this identity exists yet, the
   * logical Policy row is created first. The compiled rule set is validated structurally
   * so a malformed policy can never enter the lifecycle.
   */
  async createDraft(input: CreateDraftInput): Promise<{ policy: Policy; version: PolicyVersion }> {
    const name = input.name?.trim();
    if (!name) throw CoreError.of("INVALID_INPUT", "Policy name is required.");
    validateCompiledRules(input.rules);

    const company = await this.db.company.findUnique({ where: { id: input.companyId } });
    if (!company) {
      throw CoreError.of("TENANT_ERROR", "Company not found for policy.", {
        details: { companyId: input.companyId },
      });
    }

    return this.db.$transaction(async (tx) => {
      // Reuse an existing logical policy of the same (company, agent, name) or create it.
      let policy = await tx.policy.findFirst({
        where: { companyId: input.companyId, agentId: input.agentId ?? null, name },
      });
      policy ??= await tx.policy.create({
        data: {
          companyId: input.companyId,
          agentId: input.agentId ?? null,
          name,
          description: input.description ?? "",
          status: "DRAFT",
          createdBy: input.createdBy ?? null,
        },
      });

      const latest = await tx.policyVersion.findFirst({
        where: { policyId: policy.id },
        orderBy: { version: "desc" },
      });
      const version = (latest?.version ?? 0) + 1;

      const created = await tx.policyVersion.create({
        data: {
          policyId: policy.id,
          version,
          status: "DRAFT",
          compiledPolicyJson: { rules: input.rules } as unknown as object,
          hash: sha256Json({ policyId: policy.id, version, rules: input.rules }),
          sourceType: input.sourceType ?? null,
          sourceReference: input.sourceReference ?? null,
        },
      });

      // Persist normalized rule rows for queryability (§15).
      for (const rule of input.rules) {
        await tx.policyRule.create({
          data: {
            policyVersionId: created.id,
            ruleId: rule.rule_id,
            ruleType: rule.type,
            priority: rule.priority ?? 100,
            configurationJson: rule as unknown as object,
            enabled: rule.enabled ?? true,
          },
        });
      }

      return { policy, version: created };
    });
  }

  async getPolicy(companyId: string, policyId: string): Promise<Policy | null> {
    return this.db.policy.findFirst({ where: { id: policyId, companyId } });
  }

  async getVersion(companyId: string, policyVersionId: string): Promise<PolicyVersion | null> {
    return this.db.policyVersion.findFirst({
      where: { id: policyVersionId, policy: { companyId } },
    });
  }

  async getActiveVersion(companyId: string, policyId: string): Promise<PolicyVersion | null> {
    return this.db.policyVersion.findFirst({
      where: { policyId, status: "ACTIVE", policy: { companyId } },
    });
  }

  private assertTransition(from: PolicyVersionStatus, to: PolicyVersionStatus): void {
    if (!VERSION_TRANSITIONS[from].includes(to)) {
      throw CoreError.of("CONFLICT", `Illegal policy version transition ${from} -> ${to}.`, {
        details: { from, to },
      });
    }
  }

  private async transition(
    companyId: string,
    policyVersionId: string,
    to: PolicyVersionStatus,
  ): Promise<PolicyVersion> {
    const current = await this.getVersion(companyId, policyVersionId);
    if (!current) {
      throw CoreError.of("NOT_FOUND", "Policy version not found.", { details: { policyVersionId } });
    }
    this.assertTransition(current.status, to);
    return this.db.policyVersion.update({ where: { id: current.id }, data: { status: to } });
  }

  validate(companyId: string, policyVersionId: string): Promise<PolicyVersion> {
    return this.transition(companyId, policyVersionId, "VALIDATING");
  }

  simulate(companyId: string, policyVersionId: string): Promise<PolicyVersion> {
    return this.transition(companyId, policyVersionId, "SIMULATED");
  }

  approve(companyId: string, policyVersionId: string, approvedBy?: string): Promise<PolicyVersion> {
    return this.db.$transaction(async (tx) => {
      const current = await tx.policyVersion.findFirst({
        where: { id: policyVersionId, policy: { companyId } },
      });
      if (!current) {
        throw CoreError.of("NOT_FOUND", "Policy version not found.", { details: { policyVersionId } });
      }
      this.assertTransition(current.status, "APPROVED");
      return tx.policyVersion.update({
        where: { id: current.id },
        data: { status: "APPROVED", approvedBy: approvedBy ?? null },
      });
    });
  }

  disable(companyId: string, policyVersionId: string): Promise<PolicyVersion> {
    return this.transition(companyId, policyVersionId, "DISABLED");
  }

  /**
   * Activate an APPROVED version. Supersedes any currently-active version of the same
   * policy and repoints the logical policy's currentVersion — atomically. The activated
   * version's compiled rules are never modified (immutability).
   */
  async activate(companyId: string, policyVersionId: string): Promise<PolicyVersion> {
    return this.db.$transaction(async (tx) => {
      const target = await tx.policyVersion.findFirst({
        where: { id: policyVersionId, policy: { companyId } },
        include: { policy: true },
      });
      if (!target) {
        throw CoreError.of("NOT_FOUND", "Policy version not found.", { details: { policyVersionId } });
      }
      this.assertTransition(target.status, "ACTIVE");

      await tx.policyVersion.updateMany({
        where: { policyId: target.policyId, status: "ACTIVE" },
        data: { status: "SUPERSEDED", deactivatedAt: new Date() },
      });

      const activated = await tx.policyVersion.update({
        where: { id: target.id },
        data: { status: "ACTIVE", activatedAt: new Date() },
      });

      await tx.policy.update({
        where: { id: target.policyId },
        data: { status: "ACTIVE", currentVersion: activated.version },
      });

      return activated;
    });
  }

  /**
   * Immutability guard: attempting to mutate an ACTIVE version's rules is refused. The
   * only sanctioned change path is `createDraft` (a new version).
   */
  async assertMutableForEdit(companyId: string, policyVersionId: string): Promise<void> {
    const v = await this.getVersion(companyId, policyVersionId);
    if (!v) {
      throw CoreError.of("NOT_FOUND", "Policy version not found.", { details: { policyVersionId } });
    }
    if (v.status === "ACTIVE" || v.status === "SUPERSEDED") {
      throw CoreError.of("POLICY_INVALID", "Cannot mutate an active/superseded policy version.", {
        details: { policyVersionId, status: v.status },
      });
    }
  }

  /** Load the compiled rule set for a version. */
  async loadRules(companyId: string, policyVersionId: string): Promise<CompiledRule[]> {
    const v = await this.getVersion(companyId, policyVersionId);
    if (!v) {
      throw CoreError.of("NOT_FOUND", "Policy version not found.", { details: { policyVersionId } });
    }
    const payload = v.compiledPolicyJson as unknown as { rules: CompiledRule[] };
    return payload.rules ?? [];
  }
}
