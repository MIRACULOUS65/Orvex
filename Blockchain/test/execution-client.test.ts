import { describe, it, expect } from "vitest";
import { ChainRegistry } from "../src/chains/chain-registry.js";
import { RpcProvider } from "../src/rpc/rpc-provider.js";
import { Submitter, type Signer } from "../src/execution/submitter.js";
import { BaseSepoliaExecutionClient } from "../src/execution/base-sepolia-execution-client.js";
import { AuthorizedContextRegistry } from "../src/integration/authorized-context-registry.js";
import { InMemoryIdempotencyStore } from "../src/execution/idempotency-store.js";
import { mockTokenTransport, mockSigner, makeReceiptStore } from "./helpers/mock-transport.js";
import { FROM, RECIPIENT, OTHER, USDC, makeExecutionRequest, makeAuthorizedContext } from "./helpers/fixtures.js";

const registry = new ChainRegistry();
const baseSepolia = registry.getByNetwork("base-sepolia");

function client(opts: { balances?: Record<string, bigint>; mineAs?: { to?: string; value?: bigint } } = {}) {
  const receipts = makeReceiptStore();
  const rpc = new RpcProvider({
    chain: baseSepolia,
    rpcUrl: null,
    allowMainnet: false,
    transport: mockTokenTransport({ chainId: 84532, tokenAddress: USDC, balances: opts.balances ?? { [FROM]: 100_000_000n }, store: receipts }),
  });
  const signer: Signer = mockSigner({ address: FROM, chainId: 84532, tokenAddress: USDC, store: receipts, mineAs: opts.mineAs });
  const ctxRegistry = new AuthorizedContextRegistry();
  const c = new BaseSepoliaExecutionClient({
    rpc,
    registry,
    submitter: new Submitter(signer),
    resolver: ctxRegistry,
    timeoutMs: 2000,
    store: new InMemoryIdempotencyStore(),
  });
  return { c, ctxRegistry };
}

describe("BaseSepoliaExecutionClient — drop-in for the frozen ExecutionClient", () => {
  it("implements all 5 interface methods", () => {
    const { c } = client();
    for (const m of ["validateTransaction", "simulate", "execute", "getResult", "verify"]) {
      expect(typeof (c as unknown as Record<string, unknown>)[m]).toBe("function");
    }
  });

  it("validateTransaction returns a VALID analysis for an authorized transfer", async () => {
    const { c, ctxRegistry } = client();
    ctxRegistry.register({ transactionId: "tx_1", context: makeAuthorizedContext() });
    const a = await c.validateTransaction({ transactionId: "tx_1", network: "base-sepolia", recipient: RECIPIENT, amount: "5", asset: "USDC" });
    expect(a.status).toBe("VALID");
    expect(a.recipient).toBe(RECIPIENT);
  });

  it("execute runs the full pipeline => CONFIRMED, then verify => verified", async () => {
    const { c, ctxRegistry } = client();
    const req = makeExecutionRequest();
    ctxRegistry.register({ transactionId: req.transaction_id, executionId: req.execution_id, context: makeAuthorizedContext() });
    const result = await c.execute(req);
    expect(result.status).toBe("CONFIRMED");
    const v = await c.verify(req.execution_id);
    expect(v.verified).toBe(true);
  });

  it("FAIL CLOSED: execute with no authorized context refuses (VALIDATION_FAILED)", async () => {
    const { c } = client();
    await expect(c.execute(makeExecutionRequest())).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("execute refuses when authorized network != request network", async () => {
    const { c, ctxRegistry } = client();
    const req = makeExecutionRequest({ network: "base-sepolia" });
    // Register a context authorized for anvil while the request says base-sepolia.
    ctxRegistry.register({
      transactionId: req.transaction_id,
      executionId: req.execution_id,
      context: makeAuthorizedContext({ network: "anvil", chainId: 31337 }),
    });
    await expect(c.execute(req)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("receipt mismatch (mined to OTHER) => execute CONFIRMED but verify NOT verified", async () => {
    const { c, ctxRegistry } = client({ mineAs: { to: OTHER } });
    const req = makeExecutionRequest();
    ctxRegistry.register({ transactionId: req.transaction_id, executionId: req.execution_id, context: makeAuthorizedContext() });
    await c.execute(req);
    const v = await c.verify(req.execution_id);
    expect(v.verified).toBe(false);
    expect(v.discrepancies).toContain("recipient");
  });
});
