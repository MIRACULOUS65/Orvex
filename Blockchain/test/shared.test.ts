import { describe, it, expect } from "vitest";
import { toBaseUnits, fromBaseUnits, amountsEqual } from "../src/shared/money.js";
import { redactSecrets, containsRawSecret, REDACTED } from "../src/shared/redaction.js";
import { transactionPayloadHash } from "../src/shared/hashing.js";
import type { TransactionRequest } from "../src/contracts/execution-contracts.js";

describe("money — exact integer units, no float", () => {
  it("converts USDC decimals exactly", () => {
    expect(toBaseUnits("5", 6)).toBe(5_000_000n);
    expect(toBaseUnits("5.25", 6)).toBe(5_250_000n);
    expect(toBaseUnits("0.000001", 6)).toBe(1n);
  });

  it("avoids float error for values that break parseFloat*1e6", () => {
    // 0.29 * 1e6 in float = 289999.99999999997 -> our exact path is 290000
    expect(toBaseUnits("0.29", 6)).toBe(290_000n);
    expect(toBaseUnits("1.1", 6)).toBe(1_100_000n);
  });

  it("rejects more fractional digits than the asset supports", () => {
    expect(() => toBaseUnits("1.0000001", 6)).toThrowError(/fractional/i);
  });

  it("rejects negatives and junk", () => {
    expect(() => toBaseUnits("-1", 6)).toThrow();
    expect(() => toBaseUnits("1e6", 6)).toThrow();
    expect(() => toBaseUnits("", 6)).toThrow();
  });

  it("round-trips", () => {
    expect(fromBaseUnits(5_250_000n, 6)).toBe("5.25");
    expect(fromBaseUnits(5_000_000n, 6)).toBe("5");
    expect(amountsEqual("5", "5.00", 6)).toBe(true);
    expect(amountsEqual("5", "5.01", 6)).toBe(false);
  });
});

describe("redaction — signer isolation", () => {
  it("redacts secret-named keys and raw private keys", () => {
    const obj = {
      privateKey: "0x" + "a".repeat(64),
      note: "leak 0x" + "b".repeat(64) + " here",
      nested: { mnemonic: "one two three", ok: "value" },
    };
    const red = redactSecrets(obj) as Record<string, unknown>;
    expect(red.privateKey).toBe(REDACTED);
    expect((red.nested as Record<string, unknown>).mnemonic).toBe(REDACTED);
    expect((red.nested as Record<string, unknown>).ok).toBe("value");
    expect(String(red.note)).not.toContain("b".repeat(64));
  });

  it("detects raw secrets", () => {
    expect(containsRawSecret("0x" + "c".repeat(64))).toBe(true);
    expect(containsRawSecret("nothing sensitive")).toBe(false);
  });
});

describe("payload hashing — simulation binding", () => {
  const base: TransactionRequest = {
    schema_version: "transaction_request.v1",
    transaction_id: "tx_1",
    chain: { id: 84532, name: "base-sepolia" },
    from: "0xFrom",
    to: "0xTo",
    value: "0",
    data: "0xabcd",
    asset: { symbol: "USDC", address: "0xUSDC" },
    amount: "5",
    proposal_id: "p_1",
    intent_id: "i_1",
    created_at: new Date().toISOString(),
  };

  it("is stable regardless of created_at", () => {
    const a = transactionPayloadHash(base);
    const b = transactionPayloadHash({ ...base, created_at: new Date(Date.now() + 5000).toISOString() });
    expect(a).toBe(b);
  });

  it("changes when a material field changes (amount/recipient/data)", () => {
    const a = transactionPayloadHash(base);
    expect(transactionPayloadHash({ ...base, amount: "500" })).not.toBe(a);
    expect(transactionPayloadHash({ ...base, to: "0xOther" })).not.toBe(a);
    expect(transactionPayloadHash({ ...base, data: "0xdead" })).not.toBe(a);
  });
});
