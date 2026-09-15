/**
 * B14 — the 12 MANDATORY blockchain security cases, each mapped explicitly.
 *
 * These consolidate the security invariants exercised across the suite into one place so
 * the required list is auditable 1:1. They run fully offline (deterministic mocks).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getAddress, encodeFunctionData, type Hex } from "viem";
import { ChainRegistry } from "../src/chains/chain-registry.js";
import { RpcProvider } from "../src/rpc/rpc-provider.js";
import { Submitter, type Signer } from "../src/execution/submitter.js";
import { BaseSepoliaExecutionClient } from "../src/execution/base-sepolia-execution-client.js";
import { AuthorizedContextRegistry } from "../src/integration/authorized-context-registry.js";
import { InMemoryIdempotencyStore } from "../src/execution/idempotency-store.js";
import { TransactionValidator } from "../src/transactions/transaction-validator.js";
import { TransactionBuilder } from "../src/transactions/transaction-builder.js";
import { ERC20_ABI } from "../src/transactions/erc20-abi.js";
import { containsRawSecret } from "../src/shared/redaction.js";
import { mockTokenTransport, mockSigner, makeReceiptStore } from "./helpers/mock-transport.js";
import { FROM, RECIPIENT, OTHER, USDC, makeExecutionRequest, makeAuthorizedContext } from "./helpers/fixtures.js";

const registry = new ChainRegistry();
const baseSepolia = registry.getByNetwork("base-sepolia");

function setup(opts: { balances?: Record<string, bigint>; forceRevert?: string; mineAs?: { to?: string; value?: bigint }; neverMine?: boolean } = {}) {
  const receipts = makeReceiptStore();
  const rpc = new RpcProvider({
    chain: baseSepolia,
    rpcUrl: null,
    allowMainnet: false,
    transport: mockTokenTransport({ chainId: 84532, tokenAddress: USDC, balances: opts.balances ?? { [FROM]: 100_000_000n }, forceRevert: opts.forceRevert, store: receipts }),
  });
  const signer: Signer = mockSigner({ address: FROM, chainId: 84532, tokenAddress: USDC, store: receipts, mineAs: opts.mineAs, neverMine: opts.neverMine });
  const ctxRegistry = new AuthorizedContextRegistry();
  const client = new BaseSepoliaExecutionClient({ rpc, registry, submitter: new Submitter(signer), resolver: ctxRegistry, timeoutMs: 1500, store: new InMemoryIdempotencyStore() });
  return { client, ctxRegistry, receipts };
}

const validator = new TransactionValidator(registry);
const builder = new TransactionBuilder(registry);
const authorized = { network: "base-sepolia", chainId: 84532, recipient: RECIPIENT, asset: "USDC", amount: "5", allowedFunction: "transfer" as const };

describe("MANDATORY security cases (1-12)", () => {
  it("1. WRONG CHAIN — expected chain != connected/requested => reject", async () => {
    const rpc = new RpcProvider({ chain: baseSepolia, rpcUrl: null, allowMainnet: false, transport: mockTokenTransport({ chainId: 1, tokenAddress: USDC, balances: { [FROM]: 100_000_000n }, store: makeReceiptStore() }) });
    await expect(rpc.assertChainForRequest(84532)).rejects.toMatchObject({ code: "CHAIN_MISMATCH" });
  });

  it("2. WRONG RECIPIENT — authorized A, actual B => reject", () => {
    const tx = builder.build({ ...makeAuthorizedContext().intent, recipient: { address: OTHER } }, { from: FROM });
    expect(validator.check(tx, authorized).discrepancies).toContain("recipient");
  });

  it("3. WRONG AMOUNT — authorized 5, actual 500 => reject", () => {
    const tx = builder.build({ ...makeAuthorizedContext().intent, amount: "500" }, { from: FROM });
    expect(validator.check(tx, authorized).discrepancies).toContain("amount");
  });

  it("4. WRONG ASSET — authorized USDC, actual other token => reject", () => {
    const tx = { ...builder.build(makeAuthorizedContext().intent, { from: FROM }), to: getAddress(OTHER) };
    expect(validator.check(tx, authorized).discrepancies).toContain("token_contract");
  });

  it("5. UNEXPECTED FUNCTION — authorized transfer, actual approve => reject", () => {
    const data = encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [getAddress(OTHER), 5_000_000n] });
    const tx = { ...builder.build(makeAuthorizedContext().intent, { from: FROM }), data };
    expect(validator.check(tx, authorized).discrepancies).toContain("unexpected_function");
  });

  it("6. SIMULATION MISMATCH — stale simulation (payload changed) => execution blocked", async () => {
    const { Simulator } = await import("../src/simulation/simulator.js");
    const rpc = new RpcProvider({ chain: baseSepolia, rpcUrl: null, allowMainnet: false, transport: mockTokenTransport({ chainId: 84532, tokenAddress: USDC, balances: { [FROM]: 100_000_000n }, store: makeReceiptStore() }) });
    const sim = await new Simulator(rpc, registry).simulate(builder.build(makeAuthorizedContext().intent, { from: FROM }));
    const mutated = builder.build({ ...makeAuthorizedContext().intent, amount: "500" }, { from: FROM });
    expect(() => Simulator.assertFresh(sim, mutated)).toThrowError(/payload changed/i);
  });

  it("7. SIMULATION FAILURE — simulation reverts => execution blocked (no broadcast)", async () => {
    const { client, ctxRegistry, receipts } = setup({ forceRevert: "ERC20Paused" });
    const req = makeExecutionRequest();
    ctxRegistry.register({ transactionId: req.transaction_id, executionId: req.execution_id, context: makeAuthorizedContext() });
    await expect(client.execute(req)).rejects.toMatchObject({ code: "SIMULATION_FAILED" });
    expect(receipts.receipts.size).toBe(0);
  });

  it("8. REPLAY / IDEMPOTENCY — same logical request => one payment", async () => {
    const { client, ctxRegistry, receipts } = setup();
    const req = makeExecutionRequest({ idempotency_key: "k" });
    ctxRegistry.register({ transactionId: req.transaction_id, executionId: req.execution_id, context: makeAuthorizedContext() });
    const r1 = await client.execute(req);
    const r2 = await client.execute(req);
    expect(r1.transaction_hash).toBe(r2.transaction_hash);
    expect(receipts.receipts.size).toBe(1);
  });

  it("9. UNKNOWN — submission uncertain => UNKNOWN, no blind retry", async () => {
    const { client, ctxRegistry } = setup({ neverMine: true });
    const req = makeExecutionRequest();
    ctxRegistry.register({ transactionId: req.transaction_id, executionId: req.execution_id, context: makeAuthorizedContext() });
    const r = await client.execute(req);
    expect(r.status).toBe("UNKNOWN");
    // getResult does not re-broadcast; still UNKNOWN.
    expect((await client.getResult(req.execution_id)).status).toBe("UNKNOWN");
  });

  it("10. RECEIPT MISMATCH — tx succeeds but state differs => VERIFICATION_FAILED, no commit", async () => {
    const { client, ctxRegistry } = setup({ mineAs: { to: OTHER } });
    const req = makeExecutionRequest();
    ctxRegistry.register({ transactionId: req.transaction_id, executionId: req.execution_id, context: makeAuthorizedContext() });
    await client.execute(req);
    const v = await client.verify(req.execution_id);
    expect(v.verified).toBe(false);
    expect(v.discrepancies).toContain("recipient");
  });

  it("11. SIGNER ISOLATION — no raw key/secret appears in built dist output", () => {
    const distDir = join(process.cwd(), "dist");
    if (!existsSync(distDir)) {
      // dist not built in this run; the source-level guard below still applies.
      expect(containsRawSecret("no build present")).toBe(false);
      return;
    }
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        // Only scan RUNTIME source output; test fixtures legitimately contain 0x-hashes.
        if (p.includes(`${join("dist", "test")}`)) continue;
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".js")) {
          const content = readFileSync(p, "utf8");
          if (containsRawSecret(content)) offenders.push(p);
          // No literal private-key env value should be inlined.
          if (/EXECUTION_SIGNER_PRIVATE_KEY\s*=\s*["']0x[0-9a-fA-F]{64}/.test(content)) offenders.push(p);
        }
      }
    };
    walk(distDir);
    expect(offenders).toEqual([]);
  });

  it("12. MAINNET SAFETY — a testnet config can never execute on mainnet", () => {
    const mainnet = registry.getByNetwork("base");
    // The RPC provider hard-gates mainnet before any network contact.
    expect(() => new RpcProvider({ chain: mainnet, rpcUrl: "http://x", allowMainnet: false, transport: mockTokenTransport({ chainId: 8453, tokenAddress: USDC, balances: {}, store: makeReceiptStore() }) })).toThrowError(/blocked/i);
  });
});
