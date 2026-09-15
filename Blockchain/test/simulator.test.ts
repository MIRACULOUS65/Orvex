import { describe, it, expect } from "vitest";
import { getAddress } from "viem";
import { ChainRegistry } from "../src/chains/chain-registry.js";
import { RpcProvider } from "../src/rpc/rpc-provider.js";
import { TransactionBuilder } from "../src/transactions/transaction-builder.js";
import { Simulator } from "../src/simulation/simulator.js";
import { mockTokenTransport } from "./helpers/mock-transport.js";
import type { TransactionIntent, TransactionRequest } from "../src/contracts/execution-contracts.js";

const FROM = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const registry = new ChainRegistry();
const builder = new TransactionBuilder(registry);
const baseSepolia = registry.getByNetwork("base-sepolia");

function intent(amount = "5"): TransactionIntent {
  return {
    schema_version: "transaction_intent.v1",
    transaction_id: "tx_sim",
    proposal_id: "p_1",
    action_type: "payment",
    network: "base-sepolia",
    asset: { symbol: "USDC", address: USDC, type: "erc20" },
    amount,
    recipient: { address: RECIPIENT },
    payment_method: "usdc",
    constraints: {},
  };
}

function simulatorWith(balances: Record<string, bigint>, forceRevert?: string) {
  const rpc = new RpcProvider({
    chain: baseSepolia,
    rpcUrl: null,
    allowMainnet: false,
    transport: mockTokenTransport({ chainId: 84532, tokenAddress: USDC, balances, forceRevert }),
  });
  return new Simulator(rpc, registry);
}

describe("Simulator — deterministic EVM simulation", () => {
  it("PASS for a funded transfer, with expected state change + gas", async () => {
    const sim = simulatorWith({ [FROM]: 10_000_000n });
    const tx = builder.build(intent("5"), { from: FROM });
    const out = await sim.simulate(tx);
    expect(out.result.status).toBe("PASS");
    expect(out.result.would_revert).toBe(false);
    expect(out.result.gas_estimate?.gas).toBe("50000");
    expect(out.result.expected_state_changes[0]).toMatchObject({
      type: "erc20_transfer",
      to: getAddress(RECIPIENT),
      amount: "5",
    });
  });

  it("INSUFFICIENT_FUNDS when balance < amount", async () => {
    const sim = simulatorWith({ [FROM]: 1_000_000n });
    const tx = builder.build(intent("5"), { from: FROM });
    const out = await sim.simulate(tx);
    expect(out.result.status).toBe("INSUFFICIENT_FUNDS");
    expect(out.result.would_revert).toBe(true);
  });

  it("REVERT when the token forces a revert", async () => {
    const sim = simulatorWith({ [FROM]: 10_000_000n }, "ERC20Paused()");
    const tx = builder.build(intent("5"), { from: FROM });
    const out = await sim.simulate(tx);
    expect(out.result.status).toBe("REVERT");
    expect(out.result.would_revert).toBe(true);
    expect(out.result.revert_reason).toMatch(/paused/i);
  });

  it("UNSUPPORTED for a non-transfer payload", async () => {
    const sim = simulatorWith({ [FROM]: 10_000_000n });
    const tx: TransactionRequest = { ...builder.build(intent("5"), { from: FROM }), data: "0xdeadbeef" };
    const out = await sim.simulate(tx);
    expect(out.result.status).toBe("UNSUPPORTED");
  });

  it("STALE guard: assertFresh throws if payload changed after simulation", async () => {
    const sim = simulatorWith({ [FROM]: 10_000_000n });
    const tx = builder.build(intent("5"), { from: FROM });
    const out = await sim.simulate(tx);
    // Same payload => fresh.
    expect(() => Simulator.assertFresh(out, tx)).not.toThrow();
    // Mutated amount => stale.
    const mutated = builder.build(intent("500"), { from: FROM });
    expect(() => Simulator.assertFresh(out, mutated)).toThrowError(/payload changed/i);
  });

  it("assertFresh throws SIMULATION_FAILED if the bound simulation did not pass", async () => {
    const sim = simulatorWith({ [FROM]: 0n });
    const tx = builder.build(intent("5"), { from: FROM });
    const out = await sim.simulate(tx);
    expect(out.result.status).toBe("INSUFFICIENT_FUNDS");
    expect(() => Simulator.assertFresh(out, tx)).toThrowError(/execution blocked/i);
  });

  it("rejects a wrong-chain simulation request (CHAIN_MISMATCH)", async () => {
    const rpc = new RpcProvider({
      chain: baseSepolia,
      rpcUrl: null,
      allowMainnet: false,
      transport: mockTokenTransport({ chainId: 1, tokenAddress: USDC, balances: { [FROM]: 10_000_000n } }),
    });
    const s = new Simulator(rpc, registry);
    const tx = builder.build(intent("5"), { from: FROM });
    await expect(s.simulate(tx)).rejects.toMatchObject({ code: "CHAIN_MISMATCH" });
  });
});
