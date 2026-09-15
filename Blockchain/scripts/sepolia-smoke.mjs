/**
 * Standalone Base Sepolia smoke runner (real testnet evidence).
 *
 * Usage (PowerShell):
 *   $env:BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"
 *   $env:EXECUTION_SIGNER_PRIVATE_KEY="0x<dedicated testnet key>"
 *   # optional: $env:SEPOLIA_SMOKE_RECIPIENT, $env:SEPOLIA_SMOKE_AMOUNT
 *   node scripts/sepolia-smoke.mjs
 *
 * Prints a CONFIRMED tx hash + VERIFIED result, or a clear reason it could not run.
 * NEVER logs the private key. Requires the package to be built first (npm run build).
 */
import { ChainRegistry } from "../dist/chains/chain-registry.js";
import { RpcProvider } from "../dist/rpc/rpc-provider.js";
import { ExecutionPipeline } from "../dist/execution/execution-pipeline.js";
import { Submitter, createKeySigner } from "../dist/execution/submitter.js";
import { getSignerKey } from "../dist/config/config.js";

async function main() {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL;
  const key = getSignerKey();
  if (!rpcUrl || !key) {
    console.error("SMOKE_SKIPPED: set BASE_SEPOLIA_RPC_URL and EXECUTION_SIGNER_PRIVATE_KEY (dedicated testnet key).");
    process.exit(2);
  }
  const usdcOverride = process.env.BASE_SEPOLIA_USDC_ADDRESS ?? null;
  const registry = new ChainRegistry({ baseSepoliaUsdcAddress: usdcOverride });
  const chain = registry.getByNetwork("base-sepolia");

  const rpc = new RpcProvider({ chain, rpcUrl, allowMainnet: false });
  await rpc.assertConfiguredChain();

  const signer = createKeySigner({ privateKey: key, chain, rpcUrl });
  const recipient = process.env.SEPOLIA_SMOKE_RECIPIENT ?? signer.address;
  const amount = process.env.SEPOLIA_SMOKE_AMOUNT ?? "0.01";

  const pipeline = new ExecutionPipeline({ rpc, registry, submitter: new Submitter(signer), timeoutMs: 90_000 });

  const now = Date.now();
  const request = {
    schema_version: "execution_request.v1",
    execution_id: `sepolia_${now}`,
    decision_id: "d_smoke",
    transaction_id: "t_smoke",
    executor: { type: "eoa", account: signer.address },
    payment_method: "usdc",
    network: "base-sepolia",
    idempotency_key: `smoke_${now}`,
    authorization_context_hash: "0xsmoke",
    created_at: new Date().toISOString(),
  };
  const ctx = {
    intent: {
      schema_version: "transaction_intent.v1",
      transaction_id: "t_smoke",
      proposal_id: "p_smoke",
      action_type: "payment",
      network: "base-sepolia",
      asset: { symbol: "USDC", address: usdcOverride ?? chain.assets.USDC.address, type: "erc20" },
      amount,
      recipient: { address: recipient },
      payment_method: "usdc",
      constraints: {},
    },
    expectation: { network: "base-sepolia", chainId: 84532, recipient, asset: "USDC", amount, allowedFunction: "transfer" },
  };

  console.log(`SMOKE_START sender=${signer.address} recipient=${recipient} amount=${amount} USDC`);
  const result = await pipeline.execute(request, ctx);
  console.log(`SMOKE_RESULT status=${result.status} tx=${result.transaction_hash ?? "-"}`);
  if (result.status === "CONFIRMED") {
    const v = await pipeline.verify(result.execution_id);
    console.log(`SMOKE_VERIFY verified=${v.verified} discrepancies=${JSON.stringify(v.discrepancies)}`);
    console.log(`SMOKE_OK https://sepolia.basescan.org/tx/${result.transaction_hash}`);
  } else {
    console.log("SMOKE_UNCONFIRMED: result is not CONFIRMED (UNKNOWN => reconcile; do not blind-retry).");
  }
}

main().catch((e) => {
  console.error("SMOKE_ERROR", e?.code ?? "", e?.message ?? String(e));
  process.exit(1);
});
