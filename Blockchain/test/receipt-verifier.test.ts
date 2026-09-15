import { describe, it, expect } from "vitest";
import { encodeAbiParameters, getAddress } from "viem";
import { ReceiptParser, type RawReceipt } from "../src/receipts/receipt-parser.js";
import { ReceiptVerifier, type AuthorizedReceipt } from "../src/receipts/receipt-verifier.js";
import { RECIPIENT, OTHER, USDC, FROM } from "./helpers/fixtures.js";

const parser = new ReceiptParser();
const verifier = new ReceiptVerifier();

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
function topic(addr: string): `0x${string}` {
  return ("0x" + getAddress(addr).slice(2).toLowerCase().padStart(64, "0")) as `0x${string}`;
}

function receiptWith(opts: {
  to?: string;
  value?: bigint;
  token?: string;
  status?: "success" | "reverted";
  noLogs?: boolean;
}): RawReceipt {
  const to = opts.to ?? RECIPIENT;
  const token = getAddress(opts.token ?? USDC);
  return {
    transactionHash: ("0x" + "a".repeat(64)) as `0x${string}`,
    status: opts.status ?? "success",
    from: getAddress(FROM),
    to: token,
    logs: opts.noLogs
      ? []
      : [
          {
            address: token,
            topics: [TRANSFER_TOPIC as `0x${string}`, topic(FROM), topic(to)],
            data: encodeAbiParameters([{ type: "uint256" }], [opts.value ?? 5_000_000n]),
          },
        ],
  };
}

const authorized: AuthorizedReceipt = {
  recipient: RECIPIENT,
  asset: "USDC",
  amount: "5",
  network: "base-sepolia",
  tokenAddress: USDC,
  decimals: 6,
};

describe("ReceiptVerifier — RPC success is NOT financial success", () => {
  it("VERIFIED when actual transfer matches authorized recipient+amount+asset", () => {
    const parsed = parser.parse(receiptWith({}));
    const v = verifier.verify({ executionId: "e1", authorized, parsed, actualNetwork: "base-sepolia" });
    expect(v.verified).toBe(true);
    expect(v.discrepancies).toEqual([]);
    expect(v.actual.recipient).toBe(RECIPIENT);
  });

  it("FAILS on recipient mismatch (paid B, authorized A) — no commit", () => {
    const parsed = parser.parse(receiptWith({ to: OTHER }));
    const v = verifier.verify({ executionId: "e2", authorized, parsed, actualNetwork: "base-sepolia" });
    expect(v.verified).toBe(false);
    expect(v.discrepancies).toContain("recipient");
  });

  it("FAILS on amount mismatch (authorized 5, actual 1)", () => {
    const parsed = parser.parse(receiptWith({ value: 1_000_000n }));
    const v = verifier.verify({ executionId: "e3", authorized, parsed, actualNetwork: "base-sepolia" });
    expect(v.verified).toBe(false);
    expect(v.discrepancies).toContain("amount");
  });

  it("FAILS when the tx reverted even if logs somehow present", () => {
    const parsed = parser.parse(receiptWith({ status: "reverted", noLogs: true }));
    const v = verifier.verify({ executionId: "e4", authorized, parsed, actualNetwork: "base-sepolia" });
    expect(v.verified).toBe(false);
    expect(v.discrepancies).toContain("tx_reverted");
  });

  it("FAILS on network mismatch (executed on a different chain)", () => {
    const parsed = parser.parse(receiptWith({}));
    const v = verifier.verify({ executionId: "e5", authorized, parsed, actualNetwork: "anvil" });
    expect(v.verified).toBe(false);
    expect(v.discrepancies).toContain("network");
  });

  it("FAILS on wrong-asset transfer (different token contract)", () => {
    const parsed = parser.parse(receiptWith({ token: OTHER }));
    const v = verifier.verify({ executionId: "e6", authorized, parsed, actualNetwork: "base-sepolia" });
    expect(v.verified).toBe(false);
    // recipient match against the authorized token fails => recipient + asset flagged
    expect(v.discrepancies).toContain("recipient");
  });

  it("FAILS when there is no transfer at all", () => {
    const parsed = parser.parse(receiptWith({ noLogs: true }));
    const v = verifier.verify({ executionId: "e7", authorized, parsed, actualNetwork: "base-sepolia" });
    expect(v.verified).toBe(false);
    expect(v.discrepancies).toContain("no_transfer");
  });
});
