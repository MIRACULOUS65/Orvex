import { describe, it, expect } from "vitest";
import { ChainRegistry } from "../src/chains/chain-registry.js";
import { RpcProvider } from "../src/rpc/rpc-provider.js";
import { ExecutionPipeline } from "../src/execution/execution-pipeline.js";
import { Submitter, type Signer } from "../src/execution/submitter.js";
import { InMemoryIdempotencyStore } from "../src/execution/idempotency-store.js";
import {
  mockTokenTransport,
  mockSigner,
  makeReceiptStore,
  type MockReceiptStore,
} from "./helpers/mock-transport.js";
import {
  FROM,
  RECIPIENT,
  OTHER,
  USDC,
  makeExecutionRequest,
  makeAuthorizedContext,
} from "./helpers/fixtures.js";

const registry = new ChainRegistry();
const baseSepolia = registry.getByNetwork("base-sepolia");

interface Harness {
  pipeline: ExecutionPipeline;
  store: InMemoryIdempotencyStore;
  receipts: MockReceiptStore;
}

function harness(opts: {
  balances?: Record<string, bigint>;
  forceRevert?: string;
  mineAs?: { to?: string; value?: bigint; reverted?: boolean };
  throwOnSend?: Error;
  neverMine?: boolean;
} = {}): Harness {
  const receipts = makeReceiptStore();
  const rpc = new RpcProvider({
    chain: baseSepolia,
    rpcUrl: null,
    allowMainnet: false,
    transport: mockTokenTransport({
      chainId: 84532,
      tokenAddress: USDC,
      balances: opts.balances ?? { [FROM]: 100_000_000n },
      forceRevert: opts.forceRevert,
      store: receipts,
    }),
  });
  const signer: Signer = mockSigner({
    address: FROM,
    chainId: 84532,
    tokenAddress: USDC,
    store: receipts,
    mineAs: opts.mineAs,
    throwOnSend: opts.throwOnSend,
    neverMine: opts.neverMine,
  });
  const store = new InMemoryIdempotencyStore();
  const pipeline = new ExecutionPipeline({
    rpc,
    registry,
    submitter: new Submitter(signer),
    timeoutMs: 2000,
    store,
  });
  return { pipeline, store, receipts };
}

describe("B6 local vertical slice — 8 categories (offline deterministic)", () => {
  it("1. valid USDC payment => CONFIRMED + verified", async () => {
    const { pipeline } = harness();
    const result = await pipeline.execute(makeExecutionRequest(), makeAuthorizedContext());
    expect(result.status).toBe("CONFIRMED");
    expect(result.transaction_hash).toBeTruthy();

    const v = await pipeline.verify(result.execution_id);
    expect(v.verified).toBe(true);
    expect(v.discrepancies).toEqual([]);
    expect(v.actual.recipient).toBe(RECIPIENT);
  });

  it("2. insufficient balance => simulation blocks (INSUFFICIENT_FUNDS, no submit)", async () => {
    const { pipeline, receipts } = harness({ balances: { [FROM]: 1_000_000n } });
    await expect(
      pipeline.execute(makeExecutionRequest(), makeAuthorizedContext({ amount: "5" })),
    ).rejects.toMatchObject({ code: "SIMULATION_FAILED" });
    expect(receipts.receipts.size).toBe(0); // nothing broadcast
  });

  it("3. wrong recipient (authorized A, built B) => VALIDATION_FAILED, never executes", async () => {
    const { pipeline, receipts } = harness();
    // Authorize a payment to RECIPIENT but the intent pays OTHER.
    const ctx = makeAuthorizedContext();
    ctx.intent.recipient = { address: OTHER };
    await expect(pipeline.execute(makeExecutionRequest(), ctx)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(receipts.receipts.size).toBe(0);
  });

  it("4. wrong amount (authorized 5, intent 500) => VALIDATION_FAILED", async () => {
    const { pipeline } = harness();
    const ctx = makeAuthorizedContext({ amount: "5" });
    ctx.intent.amount = "500";
    await expect(pipeline.execute(makeExecutionRequest(), ctx)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("5. simulation revert => execution blocked", async () => {
    const { pipeline, receipts } = harness({ forceRevert: "ERC20: transfer while paused" });
    await expect(pipeline.execute(makeExecutionRequest(), makeAuthorizedContext())).rejects.toMatchObject({
      code: "SIMULATION_FAILED",
    });
    expect(receipts.receipts.size).toBe(0);
  });

  it("6. receipt mismatch (mined to a different recipient) => NOT verified, no commit signal", async () => {
    const { pipeline } = harness({ mineAs: { to: OTHER } });
    const result = await pipeline.execute(makeExecutionRequest(), makeAuthorizedContext());
    // On-chain tx succeeded...
    expect(result.status).toBe("CONFIRMED");
    // ...but independent verification catches the recipient mismatch.
    const v = await pipeline.verify(result.execution_id);
    expect(v.verified).toBe(false);
    expect(v.discrepancies).toContain("recipient");
  });

  it("6b. receipt amount mismatch (mined a smaller value) => NOT verified", async () => {
    const { pipeline } = harness({ mineAs: { value: 1_000_000n } }); // 1 USDC instead of 5
    const result = await pipeline.execute(makeExecutionRequest(), makeAuthorizedContext({ amount: "5" }));
    const v = await pipeline.verify(result.execution_id);
    expect(v.verified).toBe(false);
    expect(v.discrepancies).toContain("amount");
  });

  it("7. idempotency: same key executed twice => one broadcast, same result", async () => {
    const { pipeline, receipts } = harness();
    const req = makeExecutionRequest({ idempotency_key: "same-key" });
    const r1 = await pipeline.execute(req, makeAuthorizedContext());
    const r2 = await pipeline.execute(req, makeAuthorizedContext());
    expect(r1.transaction_hash).toBe(r2.transaction_hash);
    expect(receipts.receipts.size).toBe(1); // exactly one on-chain transaction
  });

  it("8. UNKNOWN: submit ok but receipt never mines => UNKNOWN, no blind retry", async () => {
    const { pipeline } = harness({ neverMine: true });
    const result = await pipeline.execute(makeExecutionRequest(), makeAuthorizedContext());
    expect(result.status).toBe("UNKNOWN");
    expect(result.transaction_hash).toBeTruthy(); // hash known, outcome not
    // getResult reflects UNKNOWN and does not re-broadcast.
    const again = await pipeline.getResult(result.execution_id);
    expect(again.status).toBe("UNKNOWN");
  });
});
