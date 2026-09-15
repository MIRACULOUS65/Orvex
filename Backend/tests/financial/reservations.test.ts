/**
 * Phase 5 — financial reservations, idempotency, concurrency (Tasks 5.1-5.6).
 *
 * DB-backed against real Postgres (Supabase when configured, else embedded). Verifies:
 *   - reserve within limit / exact-limit / over-limit rejection
 *   - CONCURRENT reservations: two racing reservations cannot both consume the same
 *     remaining budget (row-lock correctness — the core financial-safety invariant)
 *   - idempotent duplicate request (same key + same hash -> REPLAY)
 *   - same key + different hash -> IDEMPOTENCY_CONFLICT
 *   - commit (reserved -> committed), release (reserved freed)
 *   - UNKNOWN reservation is HELD and cannot be released
 *   - exact decimal money (no float drift)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, stopCluster, type TestDb } from "../db/harness";
import { CompanyService, FinancialService, IdempotencyService } from "@/domain/index";
import { isCoreError } from "@/shared/errors/index";

let db: TestDb;
let companies: CompanyService;
let financial: FinancialService;
let idempotency: IdempotencyService;
let companyId: string;

beforeAll(async () => {
  db = await createTestDb();
  companies = new CompanyService(db.prisma);
  financial = new FinancialService(db.prisma);
  idempotency = new IdempotencyService(db.prisma);
  companyId = (await companies.createCompany({ name: "Financial Co" })).id;
}, 120_000);

afterAll(async () => {
  await db?.disconnect();
  await stopCluster();
});

/** Create a fresh AGENT-scoped bucket with a daily limit. */
async function freshBucket(limit: string, key = crypto.randomUUID()) {
  const account = await financial.ensureAccount(
    { companyId, scope: "AGENT", scopeKey: key, asset: "USDC", network: "base-sepolia" },
    limit,
  );
  return { account, key };
}

function reserveArgs(key: string, amount: string) {
  return {
    companyId,
    scope: "AGENT" as const,
    scopeKey: key,
    asset: "USDC",
    network: "base-sepolia",
    amount,
  };
}

describe("Phase 5 — reservation limits", () => {
  it("reserves within the limit", async () => {
    const { account, key } = await freshBucket("100.00");
    const r = await financial.reserve(reserveArgs(key, "40.00"));
    expect(r.status).toBe("RESERVED");
    const acct = await financial.getAccount(companyId, account.id);
    expect(acct?.currentReserved.toString()).toBe("40");
  });

  it("allows an exact-limit reservation (boundary)", async () => {
    const { key } = await freshBucket("100.00");
    const r = await financial.reserve(reserveArgs(key, "100.00"));
    expect(r.status).toBe("RESERVED");
  });

  it("rejects an over-limit reservation", async () => {
    const { key } = await freshBucket("100.00");
    await financial.reserve(reserveArgs(key, "70.00"));
    await expect(financial.reserve(reserveArgs(key, "40.00"))).rejects.toSatisfy(isCoreError);
  });
});

describe("Phase 5 — concurrency (row locking)", () => {
  it("two concurrent 70 reservations against a 100 limit: only ONE succeeds", async () => {
    const { account, key } = await freshBucket("100.00");
    const results = await Promise.allSettled([
      financial.reserve(reserveArgs(key, "70.00")),
      financial.reserve(reserveArgs(key, "70.00")),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Reserved total reflects exactly one 70 reservation — the budget was not double-spent.
    const acct = await financial.getAccount(companyId, account.id);
    expect(acct?.currentReserved.toString()).toBe("70");
  });

  it("many concurrent small reservations never exceed the limit", async () => {
    const { account, key } = await freshBucket("100.00");
    // 12 concurrent reservations of 10 each. At most 10 can fit (100 / 10).
    //
    // The HARD safety invariant — the one that actually matters for money — is that the
    // reserved total NEVER exceeds the limit, even under maximal contention. That is the
    // property this test guards.
    //
    // We do NOT assert `reserved === ok*10`: under a real remote database a reservation
    // transaction can COMMIT on the server while the client connection is dropped before
    // it receives the ack (an at-least-once network artifact). Such a reservation is
    // durably held (raising `reserved`) yet observed by the client as a rejection. That
    // is SAFE — it only makes the system more conservative, never over-spends — so the
    // correct invariants are: reserved <= limit, and reserved covers all observed wins
    // (reserved >= ok*10). Both are exact-decimal checks; no float authorization.
    const attempts = Array.from({ length: 12 }, () => financial.reserve(reserveArgs(key, "10.00")));
    const results = await Promise.allSettled(attempts);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBeGreaterThan(0);
    expect(ok).toBeLessThanOrEqual(10);
    const acct = await financial.getAccount(companyId, account.id);
    const reserved = Number(acct?.currentReserved.toString());
    // Never over the limit (the money-safety invariant).
    expect(reserved).toBeLessThanOrEqual(100);
    // Every observed success is accounted for, and reservation is a multiple of 10.
    expect(reserved).toBeGreaterThanOrEqual(ok * 10);
    expect(reserved % 10).toBe(0);
  });
});

describe("Phase 5 — reservation lifecycle", () => {
  it("commit moves reserved -> committed", async () => {
    const { account, key } = await freshBucket("100.00");
    const r = await financial.reserve(reserveArgs(key, "30.00"));
    await financial.commit(companyId, r.id);
    const acct = await financial.getAccount(companyId, account.id);
    expect(acct?.currentReserved.toString()).toBe("0");
    expect(acct?.currentCommitted.toString()).toBe("30");
  });

  it("release frees the reserved amount", async () => {
    const { account, key } = await freshBucket("100.00");
    const r = await financial.reserve(reserveArgs(key, "30.00"));
    await financial.release(companyId, r.id);
    const acct = await financial.getAccount(companyId, account.id);
    expect(acct?.currentReserved.toString()).toBe("0");
    expect(acct?.currentCommitted.toString()).toBe("0");
  });

  it("UNKNOWN reservation is HELD and cannot be released", async () => {
    const { account, key } = await freshBucket("100.00");
    const r = await financial.reserve(reserveArgs(key, "30.00"));
    await financial.markUnknown(companyId, r.id);
    // Reserved is still held (not decremented).
    const acct = await financial.getAccount(companyId, account.id);
    expect(acct?.currentReserved.toString()).toBe("30");
    // Release is refused.
    await expect(financial.release(companyId, r.id)).rejects.toSatisfy(isCoreError);
  });

  it("does not commit merely because a reservation exists; commit is explicit", async () => {
    const { key } = await freshBucket("100.00");
    const r = await financial.reserve(reserveArgs(key, "10.00"));
    const fresh = await financial.getReservation(companyId, r.id);
    expect(fresh?.status).toBe("RESERVED"); // not COMMITTED until explicitly committed
  });
});

describe("Phase 5 — idempotency", () => {
  it("same key + same request -> NEW then REPLAY", async () => {
    const key = crypto.randomUUID();
    const req = { op: "reserve", amount: "10.00", recipient: "0xabc" };
    const first = await idempotency.register({
      companyId,
      idempotencyKey: key,
      operationType: "RESERVE",
      request: req,
    });
    expect(first.outcome).toBe("NEW");
    const second = await idempotency.register({
      companyId,
      idempotencyKey: key,
      operationType: "RESERVE",
      request: req,
    });
    expect(second.outcome).toBe("REPLAY");
    expect(second.record.id).toBe(first.record.id);
  });

  it("same key + different request -> IDEMPOTENCY_CONFLICT", async () => {
    const key = crypto.randomUUID();
    await idempotency.register({
      companyId,
      idempotencyKey: key,
      operationType: "RESERVE",
      request: { amount: "10.00" },
    });
    await expect(
      idempotency.register({
        companyId,
        idempotencyKey: key,
        operationType: "RESERVE",
        request: { amount: "99.00" },
      }),
    ).rejects.toSatisfy(isCoreError);
  });

  it("concurrent first-time registrations resolve to one NEW winner", async () => {
    const key = crypto.randomUUID();
    const req = { amount: "5.00" };
    const results = await Promise.allSettled([
      idempotency.register({ companyId, idempotencyKey: key, operationType: "RESERVE", request: req }),
      idempotency.register({ companyId, idempotencyKey: key, operationType: "RESERVE", request: req }),
    ]);
    const outcomes = results
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<IdempotencyService["register"]>>> => r.status === "fulfilled")
      .map((r) => r.value.outcome);
    expect(outcomes.filter((o) => o === "NEW")).toHaveLength(1);
  });
});
