/**
 * B6 REAL local Anvil integration — the full vertical slice against a live Anvil node.
 *
 * This suite is OPT-IN and SELF-SKIPPING: it runs only when a real Anvil is reachable at
 * ANVIL_RPC_URL. When Anvil/Foundry are not installed (the default here), the suite skips
 * cleanly so the deterministic offline suite remains the source of truth for CI.
 *
 * To run it:
 *   1. install Foundry (forge/anvil)
 *   2. `anvil` (chain id 31337)
 *   3. deploy TestUSDC:  forge create contracts/src/TestUSDC.sol:TestUSDC --private-key <anvil key> ...
 *      then mint to the sender, and set ANVIL_TEST_USDC + ANVIL_TEST_PK
 *   4. `npx vitest run test/anvil`
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createPublicClient, http } from "viem";
import { ChainRegistry } from "../../src/chains/chain-registry.js";
import { RpcProvider } from "../../src/rpc/rpc-provider.js";
import { ExecutionPipeline } from "../../src/execution/execution-pipeline.js";
import { Submitter, createKeySigner } from "../../src/execution/submitter.js";

const ANVIL_URL = process.env.ANVIL_RPC_URL ?? "http://127.0.0.1:8545";
const TEST_PK = process.env.ANVIL_TEST_PK as `0x${string}` | undefined;
const TEST_USDC = process.env.ANVIL_TEST_USDC ?? null;

async function anvilReachable(): Promise<boolean> {
  try {
    const client = createPublicClient({ transport: http(ANVIL_URL) });
    const id = await client.getChainId();
    return id === 31337;
  } catch {
    return false;
  }
}

describe("Anvil vertical slice (real, opt-in)", async () => {
  let available = false;
  beforeAll(async () => {
    available = await anvilReachable();
    if (!available) {
      // eslint-disable-next-line no-console
      console.warn("[anvil-slice] Anvil not reachable at %s — skipping real local slice.", ANVIL_URL);
    }
  });

  it.runIf(await anvilReachable())("executes + verifies a USDC transfer on Anvil", async () => {
    if (!TEST_PK || !TEST_USDC) {
      console.warn("[anvil-slice] ANVIL_TEST_PK / ANVIL_TEST_USDC not set — skipping.");
      return;
    }
    const registry = new ChainRegistry({ anvilUsdcAddress: TEST_USDC });
    const anvil = registry.getByNetwork("anvil");
    const rpc = new RpcProvider({ chain: anvil, rpcUrl: ANVIL_URL, allowMainnet: false });
    const signer = createKeySigner({ privateKey: TEST_PK, chain: anvil, rpcUrl: ANVIL_URL });
    const pipeline = new ExecutionPipeline({ rpc, registry, submitter: new Submitter(signer), timeoutMs: 15000 });

    const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // anvil #1
    const request = {
      schema_version: "execution_request.v1" as const,
      execution_id: "anvil_exec_1",
      decision_id: "d1",
      transaction_id: "t1",
      executor: { type: "eoa", account: signer.address },
      payment_method: "usdc",
      network: "anvil",
      idempotency_key: "anvil_idem_1",
      authorization_context_hash: "0xauth",
      created_at: new Date().toISOString(),
    };
    const ctx = {
      intent: {
        schema_version: "transaction_intent.v1" as const,
        transaction_id: "t1",
        proposal_id: "p1",
        action_type: "payment",
        network: "anvil",
        asset: { symbol: "USDC", address: TEST_USDC, type: "erc20" },
        amount: "1",
        recipient: { address: recipient },
        payment_method: "usdc",
        constraints: {},
      },
      expectation: { network: "anvil", chainId: 31337, recipient, asset: "USDC", amount: "1", allowedFunction: "transfer" as const },
    };

    const result = await pipeline.execute(request, ctx);
    expect(result.status).toBe("CONFIRMED");
    const v = await pipeline.verify(result.execution_id);
    expect(v.verified).toBe(true);
  });

  it("reports availability (informational)", () => {
    expect(typeof available).toBe("boolean");
  });
});
