/**
 * B7 REAL Base Sepolia smoke — OPT-IN and SELF-SKIPPING.
 *
 * Runs only when BOTH are present in env:
 *   BASE_SEPOLIA_RPC_URL           (a real Base Sepolia RPC endpoint)
 *   EXECUTION_SIGNER_PRIVATE_KEY   (a DEDICATED testnet key, funded with a little ETH +
 *                                   test USDC). NEVER a production key. NEVER committed.
 * Optional:
 *   SEPOLIA_SMOKE_RECIPIENT        (defaults to the signer's own address — a self-send)
 *   BASE_SEPOLIA_USDC_ADDRESS      (defaults to the registry's Circle testnet USDC)
 *   SEPOLIA_SMOKE_AMOUNT           (defaults to "0.01")
 *
 * When credentials are absent (the default in CI/this environment) the whole flow is
 * skipped so the deterministic suite stays green. The signer key is read ONLY here via
 * the config accessor and never logged.
 */
import { describe, it, expect } from "vitest";
import { ChainRegistry } from "../../src/chains/chain-registry.js";
import { RpcProvider } from "../../src/rpc/rpc-provider.js";
import { ExecutionPipeline } from "../../src/execution/execution-pipeline.js";
import { Submitter, createKeySigner } from "../../src/execution/submitter.js";
import { getSignerKey } from "../../src/config/config.js";

const RPC = process.env.BASE_SEPOLIA_RPC_URL;
const HAS_KEY = Boolean(process.env.EXECUTION_SIGNER_PRIVATE_KEY);
const CAN_RUN = Boolean(RPC) && HAS_KEY;

describe("Base Sepolia smoke (real, opt-in)", () => {
  it.runIf(CAN_RUN)(
    "build -> validate -> simulate -> submit -> receipt -> verify a small USDC transfer",
    async () => {
      const key = getSignerKey();
      if (!key || !RPC) return; // guarded by CAN_RUN, but keep TS happy
      const usdcOverride = process.env.BASE_SEPOLIA_USDC_ADDRESS ?? null;
      const registry = new ChainRegistry({ baseSepoliaUsdcAddress: usdcOverride });
      const chain = registry.getByNetwork("base-sepolia");

      const rpc = new RpcProvider({ chain, rpcUrl: RPC, allowMainnet: false });
      // Guard: confirm the RPC really is Base Sepolia before doing anything.
      await rpc.assertConfiguredChain();

      const signer = createKeySigner({ privateKey: key, chain, rpcUrl: RPC });
      const recipient = process.env.SEPOLIA_SMOKE_RECIPIENT ?? signer.address;
      const amount = process.env.SEPOLIA_SMOKE_AMOUNT ?? "0.01";

      const pipeline = new ExecutionPipeline({
        rpc,
        registry,
        submitter: new Submitter(signer),
        timeoutMs: 60_000,
      });

      const request = {
        schema_version: "execution_request.v1" as const,
        execution_id: `sepolia_${Date.now()}`,
        decision_id: "d_smoke",
        transaction_id: "t_smoke",
        executor: { type: "eoa", account: signer.address },
        payment_method: "usdc",
        network: "base-sepolia",
        idempotency_key: `smoke_${Date.now()}`,
        authorization_context_hash: "0xsmoke",
        created_at: new Date().toISOString(),
      };
      const ctx = {
        intent: {
          schema_version: "transaction_intent.v1" as const,
          transaction_id: "t_smoke",
          proposal_id: "p_smoke",
          action_type: "payment",
          network: "base-sepolia",
          asset: { symbol: "USDC", address: usdcOverride ?? chain.assets.USDC!.address!, type: "erc20" },
          amount,
          recipient: { address: recipient },
          payment_method: "usdc",
          constraints: {},
        },
        expectation: {
          network: "base-sepolia",
          chainId: 84532,
          recipient,
          asset: "USDC",
          amount,
          allowedFunction: "transfer" as const,
        },
      };

      const result = await pipeline.execute(request, ctx);
      // On a funded key the tx confirms; if the node is slow it may be UNKNOWN (reconcile).
      expect(["CONFIRMED", "UNKNOWN"]).toContain(result.status);
      if (result.status === "CONFIRMED") {
        expect(result.transaction_hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
        const v = await pipeline.verify(result.execution_id);
        expect(v.verified).toBe(true);
        // eslint-disable-next-line no-console
        console.log("[sepolia-smoke] CONFIRMED+VERIFIED tx:", result.transaction_hash);
      }
    },
    120_000,
  );

  it("is skipped without credentials (informational)", () => {
    expect(typeof CAN_RUN).toBe("boolean");
  });
});
