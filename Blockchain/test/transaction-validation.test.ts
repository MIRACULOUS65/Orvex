import { describe, it, expect } from "vitest";
import { encodeFunctionData, getAddress } from "viem";
import { ChainRegistry } from "../src/chains/chain-registry.js";
import { TransactionBuilder } from "../src/transactions/transaction-builder.js";
import { TransactionDecoder } from "../src/transactions/transaction-decoder.js";
import { TransactionAnalyzer } from "../src/transactions/transaction-analyzer.js";
import {
  TransactionValidator,
  type AuthorizedExpectation,
} from "../src/transactions/transaction-validator.js";
import { ERC20_ABI } from "../src/transactions/erc20-abi.js";
import type { TransactionIntent, TransactionRequest } from "../src/contracts/execution-contracts.js";

const FROM = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const OTHER = "0x3333333333333333333333333333333333333333";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const registry = new ChainRegistry();
const builder = new TransactionBuilder(registry);
const analyzer = new TransactionAnalyzer(registry);
const decoder = new TransactionDecoder();

function baseIntent(o: Partial<TransactionIntent> = {}): TransactionIntent {
  return {
    schema_version: "transaction_intent.v1",
    transaction_id: "tx_1",
    proposal_id: "p_1",
    action_type: "payment",
    network: "base-sepolia",
    asset: { symbol: "USDC", address: USDC, type: "erc20" },
    amount: "5",
    recipient: { address: RECIPIENT },
    payment_method: "usdc",
    constraints: {},
    ...o,
  };
}

const authorized: AuthorizedExpectation = {
  network: "base-sepolia",
  chainId: 84532,
  recipient: RECIPIENT,
  asset: "USDC",
  amount: "5",
  allowedFunction: "transfer",
};

describe("TransactionDecoder — derives truth from bytes", () => {
  it("decodes a transfer's real recipient and amount", () => {
    const tx = builder.build(baseIntent(), { from: FROM });
    const d = decoder.decode(tx);
    expect(d.functionName).toBe("transfer");
    expect(d.target).toBe(getAddress(RECIPIENT));
    expect(d.amountUnits).toBe(5_000_000n);
  });

  it("decodes approve and flags it as a different function", () => {
    const data = encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [getAddress(OTHER), 2n ** 256n - 1n] });
    const tx: TransactionRequest = { ...builder.build(baseIntent(), { from: FROM }), data };
    const d = decoder.decode(tx);
    expect(d.functionName).toBe("approve");
  });
});

describe("TransactionAnalyzer — status + risk flags", () => {
  it("marks a plain USDC transfer VALID", () => {
    const a = analyzer.analyze(builder.build(baseIntent(), { from: FROM }));
    expect(a.status).toBe("VALID");
    expect(a.function.name).toBe("transfer");
    expect(a.recipient).toBe(getAddress(RECIPIENT));
    expect(a.amount).toBe("5");
  });

  it("flags an unlimited approve as SUSPICIOUS with unlimited_approval", () => {
    const data = encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [getAddress(OTHER), 2n ** 256n - 1n] });
    const tx: TransactionRequest = { ...builder.build(baseIntent(), { from: FROM }), data };
    const a = analyzer.analyze(tx);
    expect(a.status).toBe("SUSPICIOUS");
    expect(a.risk_flags).toContain("unlimited_approval");
  });

  it("marks an unknown selector INVALID", () => {
    const tx: TransactionRequest = { ...builder.build(baseIntent(), { from: FROM }), data: "0xdeadbeef" };
    const a = analyzer.analyze(tx);
    expect(a.status).toBe("INVALID");
    expect(a.risk_flags).toContain("unknown_function");
  });
});

describe("TransactionValidator — authorized vs actual (security gate)", () => {
  const validator = new TransactionValidator(registry);

  it("passes a correctly-built, correctly-authorized transfer", () => {
    const tx = builder.build(baseIntent(), { from: FROM });
    expect(validator.check(tx, authorized).ok).toBe(true);
  });

  it("REJECTS wrong recipient (5 USDC -> B instead of A)", () => {
    const tx = builder.build(baseIntent({ recipient: { address: OTHER } }), { from: FROM });
    const r = validator.check(tx, authorized);
    expect(r.ok).toBe(false);
    expect(r.discrepancies).toContain("recipient");
  });

  it("REJECTS wrong amount (500 instead of 5)", () => {
    const tx = builder.build(baseIntent({ amount: "500" }), { from: FROM });
    const r = validator.check(tx, authorized);
    expect(r.ok).toBe(false);
    expect(r.discrepancies).toContain("amount");
  });

  it("REJECTS wrong asset (token contract mismatch)", () => {
    // Build with a different token address by overriding registry via a spoofed intent.
    const tx = builder.build(baseIntent(), { from: FROM });
    const spoofed: TransactionRequest = { ...tx, to: getAddress(OTHER) };
    const r = validator.check(spoofed, authorized);
    expect(r.ok).toBe(false);
    expect(r.discrepancies).toContain("token_contract");
  });

  it("REJECTS wrong chain", () => {
    const tx = builder.build(baseIntent(), { from: FROM });
    const r = validator.check(tx, { ...authorized, chainId: 1, network: "base-sepolia" });
    expect(r.ok).toBe(false);
    expect(r.discrepancies).toContain("chain");
  });

  it("REJECTS an unexpected function (approve where transfer authorized)", () => {
    const data = encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [getAddress(RECIPIENT), 5_000_000n] });
    const tx: TransactionRequest = { ...builder.build(baseIntent(), { from: FROM }), data };
    const r = validator.check(tx, authorized);
    expect(r.ok).toBe(false);
    expect(r.discrepancies).toContain("unexpected_function");
  });

  it("assertValid throws VALIDATION_FAILED on mismatch", () => {
    const tx = builder.build(baseIntent({ amount: "500" }), { from: FROM });
    expect(() => validator.assertValid(tx, authorized)).toThrowError(/authorized expectation/i);
  });
});
