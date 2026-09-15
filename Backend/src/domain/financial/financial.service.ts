/**
 * Financial state + reservation lifecycle — Phase 5, Tasks 5.1/5.2/5.5.
 *
 * Core owns durable financial authorization state (BACKEND_DATABASE.md §43-§47). The
 * lifecycle is:
 *
 *   reserve   -> RESERVED   (budget held before execution)
 *   commit    -> COMMITTED  (after CONFIRMED success: reserved -= amount; committed += amount)
 *   release   -> RELEASED   (after CONFIRMED failure: reserved -= amount)
 *   unknown   -> UNKNOWN    (execution outcome unknown: reservation is HELD, never released)
 *
 * CRITICAL invariants (batch requirements):
 *   - Atomic reservation: the check-remaining-then-insert happens inside ONE Postgres
 *     transaction with a row lock (SELECT ... FOR UPDATE) on the financial account, so
 *     two concurrent requests can NEVER both consume the same remaining budget (§46/§68).
 *   - Exact decimal money — never float (§60). All arithmetic uses Prisma.Decimal.
 *   - Do NOT release an UNKNOWN reservation. Do NOT commit merely because an execution
 *     request was created — commit only follows a CONFIRMED success.
 *   - Tenant scoping: every operation is company-scoped.
 */
import type { FinancialAccount, FinancialAccountScope, FinancialReservation, PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { CoreError } from "../../shared/errors/index.js";
import { toDecimal, gt } from "../../shared/money.js";

export interface AccountKey {
  companyId: string;
  agentId?: string | null;
  scope: FinancialAccountScope;
  scopeKey: string;
  asset: string;
  network?: string | null;
}

export interface ReserveInput extends AccountKey {
  amount: string; // decimal string
  executionRequestId?: string | null;
}

export class FinancialService {
  constructor(private readonly db: PrismaClient) {}

  /** Idempotently ensure an account exists for a bucket key, returning it. */
  async ensureAccount(key: AccountKey, limitAmount?: string | null): Promise<FinancialAccount> {
    const network = key.network ?? null;
    const existing = await this.db.financialAccount.findFirst({
      where: {
        companyId: key.companyId,
        scope: key.scope,
        scopeKey: key.scopeKey,
        asset: key.asset,
        network,
      },
    });
    if (existing) return existing;
    try {
      return await this.db.financialAccount.create({
        data: {
          companyId: key.companyId,
          agentId: key.agentId ?? null,
          scope: key.scope,
          scopeKey: key.scopeKey,
          asset: key.asset,
          network,
          limitAmount: limitAmount ?? null,
        },
      });
    } catch {
      // Lost a create race; re-read the row created by the winner.
      const row = await this.db.financialAccount.findFirst({
        where: { companyId: key.companyId, scope: key.scope, scopeKey: key.scopeKey, asset: key.asset, network },
      });
      if (!row) throw CoreError.of("INTERNAL_ERROR", "Failed to ensure financial account.");
      return row;
    }
  }

  /**
   * Atomically reserve budget. Locks the account row FOR UPDATE, checks that
   * committed + reserved + amount <= limit, then inserts the reservation and bumps the
   * reserved total — all in one transaction. Throws POLICY_VIOLATION if it would exceed
   * the limit. Concurrent callers serialize on the row lock, so only the requests that
   * fit within the remaining budget succeed.
   */
  async reserve(input: ReserveInput): Promise<FinancialReservation> {
    const account = await this.ensureAccount(input);
    const amount = toDecimal(input.amount);

    return this.db.$transaction(async (tx) => {
      // Row-lock the account. Prisma has no native FOR UPDATE, so use a raw locked read.
      const locked = await tx.$queryRaw<
        Array<{ current_reserved: string; current_committed: string; limit_amount: string | null }>
      >(Prisma.sql`
        SELECT current_reserved, current_committed, limit_amount
        FROM financial_accounts
        WHERE id = ${account.id}
        FOR UPDATE
      `);
      const row = locked[0];
      if (!row) {
        throw CoreError.of("INTERNAL_ERROR", "Financial account vanished during reservation.");
      }

      const reserved = toDecimal(row.current_reserved);
      const committed = toDecimal(row.current_committed);
      const projected = reserved.plus(committed).plus(amount);

      if (row.limit_amount !== null) {
        const limit = toDecimal(row.limit_amount);
        if (gt(projected, limit)) {
          throw CoreError.of("POLICY_VIOLATION", "Reservation would exceed the budget limit.", {
            details: {
              accountId: account.id,
              requested: input.amount,
              committed: committed.toString(),
              reserved: reserved.toString(),
              limit: limit.toString(),
            },
          });
        }
      }

      const reservation = await tx.financialReservation.create({
        data: {
          companyId: input.companyId,
          agentId: input.agentId ?? null,
          executionRequestId: input.executionRequestId ?? null,
          financialAccountId: account.id,
          amount: input.amount,
          asset: input.asset,
          status: "RESERVED",
        },
      });

      await tx.financialAccount.update({
        where: { id: account.id },
        data: { currentReserved: reserved.plus(amount).toString() },
      });

      return reservation;
    });
  }

  /**
   * Commit a reservation after CONFIRMED execution success: reserved -= amount,
   * committed += amount. Idempotent-safe: committing an already-COMMITTED reservation
   * is a no-op; committing a RELEASED/UNKNOWN reservation is refused.
   */
  async commit(companyId: string, reservationId: string): Promise<FinancialReservation> {
    return this.db.$transaction(async (tx) => {
      const res = await tx.financialReservation.findFirst({
        where: { id: reservationId, companyId },
      });
      if (!res) throw CoreError.of("NOT_FOUND", "Reservation not found.", { details: { reservationId } });
      if (res.status === "COMMITTED") return res;
      if (res.status !== "RESERVED") {
        throw CoreError.of("CONFLICT", `Cannot commit a ${res.status} reservation.`, {
          details: { reservationId, status: res.status },
        });
      }

      const locked = await tx.$queryRaw<Array<{ current_reserved: string; current_committed: string }>>(
        Prisma.sql`SELECT current_reserved, current_committed FROM financial_accounts WHERE id = ${res.financialAccountId} FOR UPDATE`,
      );
      const row = locked[0];
      if (!row) throw CoreError.of("INTERNAL_ERROR", "Account missing during commit.");
      const amount = toDecimal(res.amount.toString());

      await tx.financialAccount.update({
        where: { id: res.financialAccountId },
        data: {
          currentReserved: toDecimal(row.current_reserved).minus(amount).toString(),
          currentCommitted: toDecimal(row.current_committed).plus(amount).toString(),
        },
      });

      return tx.financialReservation.update({
        where: { id: res.id },
        data: { status: "COMMITTED", committedAt: new Date() },
      });
    });
  }

  /**
   * Release a reservation after CONFIRMED failure: reserved -= amount. Refuses to
   * release an UNKNOWN reservation (must be reconciled first) — this is the core
   * safety rule that prevents losing a hold whose real outcome is unknown.
   */
  async release(companyId: string, reservationId: string): Promise<FinancialReservation> {
    return this.db.$transaction(async (tx) => {
      const res = await tx.financialReservation.findFirst({
        where: { id: reservationId, companyId },
      });
      if (!res) throw CoreError.of("NOT_FOUND", "Reservation not found.", { details: { reservationId } });
      if (res.status === "RELEASED") return res;
      if (res.status === "UNKNOWN") {
        throw CoreError.of("CONFLICT", "Cannot release an UNKNOWN reservation; reconcile it first.", {
          details: { reservationId },
        });
      }
      if (res.status !== "RESERVED") {
        throw CoreError.of("CONFLICT", `Cannot release a ${res.status} reservation.`, {
          details: { reservationId, status: res.status },
        });
      }

      const locked = await tx.$queryRaw<Array<{ current_reserved: string }>>(
        Prisma.sql`SELECT current_reserved FROM financial_accounts WHERE id = ${res.financialAccountId} FOR UPDATE`,
      );
      const row = locked[0];
      if (!row) throw CoreError.of("INTERNAL_ERROR", "Account missing during release.");
      const amount = toDecimal(res.amount.toString());

      await tx.financialAccount.update({
        where: { id: res.financialAccountId },
        data: { currentReserved: toDecimal(row.current_reserved).minus(amount).toString() },
      });

      return tx.financialReservation.update({
        where: { id: res.id },
        data: { status: "RELEASED", releasedAt: new Date() },
      });
    });
  }

  /**
   * Reconciliation release: release a reservation that is RESERVED or UNKNOWN. This is
   * the ONLY sanctioned path to free an UNKNOWN hold, and only after the authoritative
   * layer has reconciled the outcome to a confirmed FAILURE (Phase 13 reconciliation).
   * It is NOT the ordinary `release` (which refuses UNKNOWN by design).
   */
  async reconcileRelease(companyId: string, reservationId: string): Promise<FinancialReservation> {
    return this.db.$transaction(async (tx) => {
      const res = await tx.financialReservation.findFirst({ where: { id: reservationId, companyId } });
      if (!res) throw CoreError.of("NOT_FOUND", "Reservation not found.", { details: { reservationId } });
      if (res.status === "RELEASED") return res;
      if (res.status === "COMMITTED") {
        throw CoreError.of("CONFLICT", "Cannot release a COMMITTED reservation.", { details: { reservationId } });
      }
      const locked = await tx.$queryRaw<Array<{ current_reserved: string }>>(
        Prisma.sql`SELECT current_reserved FROM financial_accounts WHERE id = ${res.financialAccountId} FOR UPDATE`,
      );
      const row = locked[0];
      if (!row) throw CoreError.of("INTERNAL_ERROR", "Account missing during reconcile release.");
      const amount = toDecimal(res.amount.toString());
      await tx.financialAccount.update({
        where: { id: res.financialAccountId },
        data: { currentReserved: toDecimal(row.current_reserved).minus(amount).toString() },
      });
      return tx.financialReservation.update({
        where: { id: res.id },
        data: { status: "RELEASED", releasedAt: new Date() },
      });
    });
  }

  /**
   * Mark a reservation UNKNOWN (execution outcome unknown). The reservation is HELD:
   * the reserved total is intentionally NOT decremented, so the budget stays consumed
   * until an operator reconciles the true outcome.
   */
  async markUnknown(companyId: string, reservationId: string): Promise<FinancialReservation> {
    const res = await this.db.financialReservation.findFirst({ where: { id: reservationId, companyId } });
    if (!res) throw CoreError.of("NOT_FOUND", "Reservation not found.", { details: { reservationId } });
    if (res.status !== "RESERVED" && res.status !== "UNKNOWN") {
      throw CoreError.of("CONFLICT", `Cannot mark ${res.status} reservation UNKNOWN.`, {
        details: { reservationId, status: res.status },
      });
    }
    return this.db.financialReservation.update({
      where: { id: res.id },
      data: { status: "UNKNOWN" },
    });
  }

  async getAccount(companyId: string, accountId: string): Promise<FinancialAccount | null> {
    return this.db.financialAccount.findFirst({ where: { id: accountId, companyId } });
  }

  async getReservation(companyId: string, reservationId: string): Promise<FinancialReservation | null> {
    return this.db.financialReservation.findFirst({ where: { id: reservationId, companyId } });
  }
}
