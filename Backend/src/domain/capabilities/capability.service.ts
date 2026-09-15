/**
 * Capability Manager — Phase 3, Tasks 3.5 / 3.6.
 *
 * A Capability is a scoped authorization envelope (BACKEND_DATABASE.md §11/§12).
 * Invariants enforced here:
 *   - capability ⊆ Constitution: a capability may not authorize an action/asset/
 *     network/category the agent's active constitution does not allow (plan 3.5).
 *   - delegated capability ⊆ parent: a child capability may not expand amount, asset,
 *     network, category, recipient, time, or action beyond its parent (§12, batch
 *     invariant 5).
 *   - expired/revoked capabilities cannot authorize future actions (batch invariant 7):
 *     `validateCapability` fails closed for any non-ACTIVE or time-expired capability.
 *   - tenant scoping: all reads/writes are company-scoped.
 *
 * Money limits use exact Decimal comparison — never float (§60).
 */
import type { Capability, PrismaClient } from "@prisma/client";
import { CoreError } from "../../shared/errors/index.js";
import { Decimal, gt, toDecimal } from "../../shared/money.js";
import type { ConstitutionConfig } from "../constitutions/constitution.service.js";

export interface CreateCapabilityInput {
  companyId: string;
  agentId: string;
  action: string;
  asset?: string | null;
  network?: string | null;
  categoryScope?: string[] | null;
  recipientScope?: string[] | null;
  singleTransactionLimit?: string | null;
  dailyLimit?: string | null;
  weeklyLimit?: string | null;
  monthlyLimit?: string | null;
  validFrom?: Date;
  expiresAt?: Date | null;
  parentCapabilityId?: string | null;
  createdBy?: string;
}

/** Optional decimal limit -> Decimal | null. */
function optDecimal(v: string | null | undefined): Decimal | null {
  return v === null || v === undefined ? null : toDecimal(v);
}

/**
 * A null (absent) limit means "no limit at this dimension". Containment: a child limit
 * is valid iff it is present AND <= a present parent limit; if the parent has a limit,
 * the child MUST have one that does not exceed it; if the parent is unlimited, any
 * child limit (or none) is fine.
 */
function limitWithinParent(child: Decimal | null, parent: Decimal | null): boolean {
  if (parent === null) return true; // parent unlimited -> anything allowed
  if (child === null) return false; // parent limited but child unlimited -> expands
  return !gt(child, parent); // child <= parent
}

/** Set containment: child scope must be a subset of parent scope (when parent scopes). */
function scopeWithinParent(child: string[] | null, parent: string[] | null): boolean {
  if (parent === null || parent.length === 0) return true; // parent unrestricted
  if (child === null || child.length === 0) return false; // parent restricts, child open
  const parentSet = new Set(parent);
  return child.every((c) => parentSet.has(c));
}

function asStringArray(json: unknown): string[] | null {
  if (json === null || json === undefined) return null;
  if (Array.isArray(json)) return json.filter((x): x is string => typeof x === "string");
  return null;
}

export class CapabilityService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Verify a candidate capability is contained within the agent's active constitution.
   * Throws AUTHORIZATION_ERROR on any expansion beyond the constitution.
   */
  private assertWithinConstitution(
    input: CreateCapabilityInput,
    constitution: ConstitutionConfig,
  ): void {
    const allowedActions = constitution.allowed_actions ?? [];
    if (!allowedActions.includes(input.action)) {
      throw CoreError.of("AUTHORIZATION_ERROR", "Capability action not allowed by constitution.", {
        details: { action: input.action },
      });
    }
    const blockedActions = constitution.blocked_actions ?? [];
    if (blockedActions.includes(input.action)) {
      throw CoreError.of("AUTHORIZATION_ERROR", "Capability action is blocked by constitution.", {
        details: { action: input.action },
      });
    }
    if (input.asset && constitution.allowed_assets && constitution.allowed_assets.length > 0) {
      if (!constitution.allowed_assets.includes(input.asset)) {
        throw CoreError.of("AUTHORIZATION_ERROR", "Capability asset not allowed by constitution.", {
          details: { asset: input.asset },
        });
      }
    }
    if (input.network && constitution.allowed_networks && constitution.allowed_networks.length > 0) {
      if (!constitution.allowed_networks.includes(input.network)) {
        throw CoreError.of("AUTHORIZATION_ERROR", "Capability network not allowed by constitution.", {
          details: { network: input.network },
        });
      }
    }
    if (input.categoryScope && constitution.allowed_categories && constitution.allowed_categories.length > 0) {
      const allowed = new Set(constitution.allowed_categories);
      const outside = input.categoryScope.filter((c) => !allowed.has(c));
      if (outside.length > 0) {
        throw CoreError.of("AUTHORIZATION_ERROR", "Capability category outside constitution.", {
          details: { categories: outside },
        });
      }
    }
    // Single-transaction limit must not exceed the constitution's single_transaction cap.
    const constLimit = constitution.spending_limits?.single_transaction;
    if (constLimit && input.singleTransactionLimit) {
      if (gt(toDecimal(input.singleTransactionLimit), toDecimal(constLimit))) {
        throw CoreError.of("AUTHORIZATION_ERROR", "Capability single-tx limit exceeds constitution.", {
          details: { capability: input.singleTransactionLimit, constitution: constLimit },
        });
      }
    }
  }

  /** Verify a child capability does not expand beyond its parent (§12). */
  private assertWithinParent(input: CreateCapabilityInput, parent: Capability): void {
    if (parent.status !== "ACTIVE") {
      throw CoreError.of("AUTHORIZATION_ERROR", "Parent capability is not active.", {
        details: { parentId: parent.id, status: parent.status },
      });
    }
    if (parent.action !== input.action) {
      throw CoreError.of("AUTHORIZATION_ERROR", "Child action must match parent action.", {
        details: { child: input.action, parent: parent.action },
      });
    }
    if (parent.asset && input.asset !== parent.asset) {
      throw CoreError.of("AUTHORIZATION_ERROR", "Child asset must match parent asset.", {
        details: { child: input.asset, parent: parent.asset },
      });
    }
    if (parent.network && input.network !== parent.network) {
      throw CoreError.of("AUTHORIZATION_ERROR", "Child network must match parent network.", {
        details: { child: input.network, parent: parent.network },
      });
    }
    if (!scopeWithinParent(input.categoryScope ?? null, asStringArray(parent.categoryScopeJson))) {
      throw CoreError.of("AUTHORIZATION_ERROR", "Child category scope exceeds parent.");
    }
    if (!scopeWithinParent(input.recipientScope ?? null, asStringArray(parent.recipientScopeJson))) {
      throw CoreError.of("AUTHORIZATION_ERROR", "Child recipient scope exceeds parent.");
    }
    // Money limits: child must not exceed parent at each dimension.
    const checks: Array<[Decimal | null, Decimal | null, string]> = [
      [optDecimal(input.singleTransactionLimit), parent.singleTransactionLimit, "single_transaction"],
      [optDecimal(input.dailyLimit), parent.dailyLimit, "daily"],
      [optDecimal(input.weeklyLimit), parent.weeklyLimit, "weekly"],
      [optDecimal(input.monthlyLimit), parent.monthlyLimit, "monthly"],
    ];
    for (const [child, parentLimit, label] of checks) {
      if (!limitWithinParent(child, parentLimit)) {
        throw CoreError.of("AUTHORIZATION_ERROR", `Child ${label} limit exceeds parent.`, {
          details: { dimension: label },
        });
      }
    }
    // Time: child expiry must not outlast parent expiry.
    if (parent.expiresAt && (!input.expiresAt || input.expiresAt > parent.expiresAt)) {
      throw CoreError.of("AUTHORIZATION_ERROR", "Child capability outlives parent expiry.");
    }
  }

  /**
   * Create a capability. Enforces constitution containment and (if delegated) parent
   * containment. The capability is created ACTIVE.
   */
  async createCapability(input: CreateCapabilityInput): Promise<Capability> {
    const agent = await this.db.agent.findFirst({
      where: { id: input.agentId, companyId: input.companyId },
    });
    if (!agent) {
      throw CoreError.of("TENANT_ERROR", "Agent not found in this company.", {
        details: { companyId: input.companyId, agentId: input.agentId },
      });
    }

    // capability ⊆ active constitution (if one is active).
    const constitution = await this.db.constitution.findFirst({
      where: { companyId: input.companyId, agentId: input.agentId, status: "ACTIVE" },
    });
    if (constitution) {
      this.assertWithinConstitution(
        input,
        constitution.configurationJson as unknown as ConstitutionConfig,
      );
    }

    // delegated capability ⊆ parent.
    if (input.parentCapabilityId) {
      const parent = await this.db.capability.findFirst({
        where: { id: input.parentCapabilityId, companyId: input.companyId, agentId: input.agentId },
      });
      if (!parent) {
        throw CoreError.of("TENANT_ERROR", "Parent capability not found for this agent.", {
          details: { parentCapabilityId: input.parentCapabilityId },
        });
      }
      this.assertWithinParent(input, parent);
    }

    return this.db.capability.create({
      data: {
        companyId: input.companyId,
        agentId: input.agentId,
        parentCapabilityId: input.parentCapabilityId ?? null,
        action: input.action,
        asset: input.asset ?? null,
        network: input.network ?? null,
        categoryScopeJson: (input.categoryScope ?? null) as unknown as object,
        recipientScopeJson: (input.recipientScope ?? null) as unknown as object,
        singleTransactionLimit: input.singleTransactionLimit ?? null,
        dailyLimit: input.dailyLimit ?? null,
        weeklyLimit: input.weeklyLimit ?? null,
        monthlyLimit: input.monthlyLimit ?? null,
        validFrom: input.validFrom ?? new Date(),
        expiresAt: input.expiresAt ?? null,
        status: "ACTIVE",
        createdBy: input.createdBy ?? null,
      },
    });
  }

  async getCapability(companyId: string, capabilityId: string): Promise<Capability | null> {
    return this.db.capability.findFirst({ where: { id: capabilityId, companyId } });
  }

  /** Active, non-expired capabilities for an agent. */
  async getActiveCapabilities(
    companyId: string,
    agentId: string,
    now: Date = new Date(),
  ): Promise<Capability[]> {
    return this.db.capability.findMany({
      where: {
        companyId,
        agentId,
        status: "ACTIVE",
        validFrom: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Fail-closed validation that a capability may authorize an action AT `now`. Returns
   * the capability if usable, otherwise throws. Expired/revoked capabilities can never
   * authorize (batch invariant 7).
   */
  async validateCapability(
    companyId: string,
    capabilityId: string,
    now: Date = new Date(),
  ): Promise<Capability> {
    const cap = await this.getCapability(companyId, capabilityId);
    if (!cap) {
      throw CoreError.of("CAPABILITY_INVALID", "Capability not found.", {
        details: { capabilityId },
      });
    }
    if (cap.status === "REVOKED") {
      throw CoreError.of("CAPABILITY_INVALID", "Capability has been revoked.", {
        details: { capabilityId },
      });
    }
    if (cap.status === "EXPIRED" || (cap.expiresAt && cap.expiresAt <= now)) {
      throw CoreError.of("CAPABILITY_EXPIRED", "Capability has expired.", {
        details: { capabilityId, expiresAt: cap.expiresAt?.toISOString() },
      });
    }
    if (cap.validFrom > now) {
      throw CoreError.of("CAPABILITY_INVALID", "Capability is not yet valid.", {
        details: { capabilityId, validFrom: cap.validFrom.toISOString() },
      });
    }
    return cap;
  }

  /** Revoke a capability (and cascade to its delegated children). */
  async revokeCapability(companyId: string, capabilityId: string): Promise<Capability> {
    return this.db.$transaction(async (tx) => {
      const cap = await tx.capability.findFirst({ where: { id: capabilityId, companyId } });
      if (!cap) {
        throw CoreError.of("CAPABILITY_INVALID", "Capability not found.", {
          details: { capabilityId },
        });
      }
      const now = new Date();
      // Revoking a parent revokes its children — a child cannot outlive revoked parent.
      await tx.capability.updateMany({
        where: { companyId, parentCapabilityId: cap.id, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt: now },
      });
      return tx.capability.update({
        where: { id: cap.id },
        data: { status: "REVOKED", revokedAt: now },
      });
    });
  }

  /**
   * Mark expired capabilities EXPIRED (housekeeping). Any ACTIVE capability whose
   * expiresAt has passed becomes EXPIRED. Returns the count updated.
   */
  async expireCapabilities(companyId: string, now: Date = new Date()): Promise<number> {
    const result = await this.db.capability.updateMany({
      where: { companyId, status: "ACTIVE", expiresAt: { lte: now } },
      data: { status: "EXPIRED" },
    });
    return result.count;
  }
}
