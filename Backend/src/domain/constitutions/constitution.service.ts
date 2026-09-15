/**
 * Constitution domain service — Phase 3, Task 3.4.
 *
 * A Constitution is a versioned authority definition (BACKEND_DATABASE.md §9/§10).
 * Invariants enforced here:
 *   - Active versions are IMMUTABLE. A change creates a NEW version row; we never
 *     mutate the configuration of an existing version in place.
 *   - Activating a new version supersedes the previously-active version and repoints
 *     the agent's active_constitution_id — inside a single transaction so there is
 *     never more than one ACTIVE constitution per agent.
 *   - Historical versions remain reconstructable: superseded rows keep their exact
 *     configuration + hash, so a past decision can always be re-read against the
 *     constitution version that was active when it was made (batch invariant 8).
 *   - Tenant/agent consistency: the active constitution always belongs to the same
 *     company and agent (batch invariant 3).
 */
import type { Constitution, PrismaClient } from "@prisma/client";
import { CoreError } from "../../shared/errors/index.js";
import { sha256Json } from "../../shared/hash.js";

/**
 * The canonical constitution configuration (mirrors CONTRACTS.md §7). Stored as JSONB;
 * validated structurally on create so an invalid constitution can never be activated.
 */
export interface ConstitutionConfig {
  purpose: string;
  allowed_actions: string[];
  blocked_actions?: string[];
  allowed_assets?: string[];
  allowed_networks?: string[];
  allowed_categories?: string[];
  blocked_categories?: string[];
  spending_limits?: Record<string, string>;
  approval_rules?: unknown[];
  recipient_rules?: Record<string, unknown>;
  time_rules?: Record<string, unknown>;
}

export interface CreateConstitutionInput {
  companyId: string;
  agentId: string;
  config: ConstitutionConfig;
  createdBy?: string;
}

export class ConstitutionService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Structural validation. Returns the (possibly normalized) config or throws. Money
   * limits must be decimal strings (never floats) — enforced by regex here so a bad
   * value can never reach the deterministic engine.
   */
  validateConstitution(config: ConstitutionConfig): ConstitutionConfig {
    if (!config || typeof config !== "object") {
      throw CoreError.of("INVALID_INPUT", "Constitution config is required.");
    }
    if (!Array.isArray(config.allowed_actions) || config.allowed_actions.length === 0) {
      throw CoreError.of("INVALID_INPUT", "Constitution must allow at least one action.");
    }
    const limits = config.spending_limits ?? {};
    for (const [key, value] of Object.entries(limits)) {
      if (typeof value !== "string" || !/^\d+(\.\d+)?$/u.test(value)) {
        throw CoreError.of(
          "INVALID_INPUT",
          `Spending limit '${key}' must be a non-negative decimal string.`,
          { details: { key, value } },
        );
      }
    }
    return config;
  }

  /**
   * Create a new DRAFT constitution version for an agent. The version number is the
   * next integer after the agent's highest existing version — historical versions are
   * never overwritten.
   */
  async createConstitution(input: CreateConstitutionInput): Promise<Constitution> {
    const config = this.validateConstitution(input.config);

    // Tenant/agent consistency: the agent must exist within the company.
    const agent = await this.db.agent.findFirst({
      where: { id: input.agentId, companyId: input.companyId },
    });
    if (!agent) {
      throw CoreError.of("TENANT_ERROR", "Agent not found in this company.", {
        details: { companyId: input.companyId, agentId: input.agentId },
      });
    }

    const latest = await this.db.constitution.findFirst({
      where: { agentId: input.agentId },
      orderBy: { version: "desc" },
    });
    const version = (latest?.version ?? 0) + 1;

    return this.db.constitution.create({
      data: {
        companyId: input.companyId,
        agentId: input.agentId,
        version,
        status: "DRAFT",
        purpose: config.purpose ?? "",
        configurationJson: config as unknown as object,
        hash: sha256Json({ agentId: input.agentId, version, config }),
        createdBy: input.createdBy ?? null,
      },
    });
  }

  /** Company-scoped fetch of a specific constitution row. */
  async getConstitution(companyId: string, constitutionId: string): Promise<Constitution | null> {
    return this.db.constitution.findFirst({ where: { id: constitutionId, companyId } });
  }

  /** Reconstruct a historical version exactly as it was (batch invariant 8). */
  async getConstitutionVersion(
    companyId: string,
    agentId: string,
    version: number,
  ): Promise<Constitution | null> {
    return this.db.constitution.findFirst({ where: { companyId, agentId, version } });
  }

  /** The currently-active constitution for an agent, if any. */
  async getActiveConstitution(companyId: string, agentId: string): Promise<Constitution | null> {
    return this.db.constitution.findFirst({
      where: { companyId, agentId, status: "ACTIVE" },
    });
  }

  /**
   * Activate a constitution version. Supersedes any currently-active version and
   * repoints the agent — atomically — so an agent has exactly one active constitution.
   * The activated version's configuration is never modified.
   */
  async activateConstitution(companyId: string, constitutionId: string): Promise<Constitution> {
    return this.db.$transaction(async (tx) => {
      const target = await tx.constitution.findFirst({
        where: { id: constitutionId, companyId },
      });
      if (!target) {
        throw CoreError.of("NOT_FOUND", "Constitution not found in this company.", {
          details: { companyId, constitutionId },
        });
      }
      if (target.status === "SUPERSEDED" || target.status === "DISABLED") {
        throw CoreError.of(
          "CONFLICT",
          "Cannot activate a superseded or disabled constitution version.",
          { details: { constitutionId, status: target.status } },
        );
      }

      // Supersede the prior active version for this agent (immutably: only status +
      // deactivatedAt change; configuration/hash are untouched).
      await tx.constitution.updateMany({
        where: { companyId, agentId: target.agentId, status: "ACTIVE" },
        data: { status: "SUPERSEDED", deactivatedAt: new Date() },
      });

      const activated = await tx.constitution.update({
        where: { id: target.id },
        data: { status: "ACTIVE", activatedAt: new Date() },
      });

      // Repoint the agent to the newly-active constitution (same company/agent).
      await tx.agent.update({
        where: { id: target.agentId },
        data: { activeConstitutionId: activated.id },
      });

      return activated;
    });
  }
}
