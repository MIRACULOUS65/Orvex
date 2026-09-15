import { describe, it, expect } from "vitest";
import { encodeFunctionData, getAddress } from "viem";
import { ChainRegistry } from "../src/chains/chain-registry.js";
import { TransactionBuilder } from "../src/transactions/transaction-builder.js";
import { ERC20_ABI, TRANSFER_SELECTOR } from "../src/transactions/erc20-abi.js";
import type { TransactionIntent } from "../src/contracts/execution-contracts.js";

const FROM = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

function intent(overrides: Partial<TransactionIntent> = {}): TransactionIntent {
  return {
    schema_version: "transaction_intent.v1",
    transaction_id: "tx_1",
    proposal_id: "p_1",
    action_type: "payment",
    network: "base-sepolia",
    asset: { symbol: "USDC", address: USDC, type: "erc20" },
    amount: "5.25",
    recipient: { address: RECIPIENT, type: "provider" },
    payment_method: "usdc",
    constraints: {},
    ...overrides,
  };
}

describe("TransactionBuilder — USDC transfer", () => {
  const registry = new ChainRegistry();
  const builder = new TransactionBuilder(registry);

  it("builds a valid USDC transfer with exact integer units and viem calldata", () => {
    const req = builder.build(intent(), { from: FROM });
    expect(req.chain).toEqual({ id: 84532, name: "base-sepolia" });
    // tx.to is the TOKEN contract; recipient lives in calldata
    expect(req.to).toBe(getAddress(USDC));
    expect(req.value).toBe("0");
    expect(req.data.startsWith(TRANSFER_SELECTOR)).toBe(true);

    const expectedData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [getAddress(RECIPIENT), 5_250_000n],
    });
    expect(req.data).toBe(expectedData);
    expect(req.amount).toBe("5.25");
    expect(req.asset.symbol).toBe("USDC");
  });

  it("checksum-normalizes addresses so downstream hashing is stable", () => {
    const req = builder.build(intent({ recipient: { address: RECIPIENT.toLowerCase() } }), {
      from: FROM.toLowerCase(),
    });
    expect(req.from).toBe(getAddress(FROM));
  });

  it("rejects a non-positive amount", () => {
    expect(() => builder.build(intent({ amount: "0" }), { from: FROM })).toThrowError(/positive/i);
  });

  it("rejects sub-cent precision beyond token decimals", () => {
    expect(() => builder.build(intent({ amount: "1.0000001" }), { from: FROM })).toThrowError(/fractional/i);
  });

  it("rejects a non-USDC asset in V1", () => {
    expect(() =>
      builder.build(intent({ asset: { symbol: "DAI", address: USDC } }), { from: FROM }),
    ).toThrowError(/USDC/);
  });

  it("rejects an invalid recipient address", () => {
    expect(() =>
      builder.build(intent({ recipient: { address: "not-an-address" } }), { from: FROM }),
    ).toThrowError(/recipient/i);
  });

  it("rejects an unsupported action_type", () => {
    expect(() => builder.build(intent({ action_type: "swap" }), { from: FROM })).toThrowError(/action_type/i);
  });
});
