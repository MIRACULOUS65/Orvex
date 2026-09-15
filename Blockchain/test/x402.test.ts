import { describe, it, expect } from "vitest";
import { getAddress } from "viem";
import {
  X402Adapter,
  FacilitatorClient,
  SettlementVerifier,
  type FacilitatorTransport,
} from "../src/x402/x402-adapter.js";
import { PaymentRequirementParser } from "../src/x402/payment-requirement.js";
import { RECIPIENT, USDC, OTHER } from "./helpers/fixtures.js";

const parseOptions = { allowedNetworks: ["base-sepolia"], expectedUsdc: USDC };

function requirement(o: Record<string, unknown> = {}) {
  return {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: "0.10",
    payTo: RECIPIENT,
    asset: USDC,
    resource: "https://api.example.com/data",
    ...o,
  };
}

describe("PaymentRequirementParser — untrusted external input", () => {
  const parser = new PaymentRequirementParser();

  it("parses a valid exact/USDC/base-sepolia requirement", () => {
    const p = parser.parse(requirement(), parseOptions);
    expect(p.amount).toBe("0.10");
    expect(p.payTo).toBe(getAddress(RECIPIENT));
    expect(p.asset).toBe(getAddress(USDC));
  });

  it("rejects a non-allowed network", () => {
    expect(() => parser.parse(requirement({ network: "base" }), parseOptions)).toThrowError(/allow-listed/i);
  });

  it("rejects a wrong asset (not the expected USDC contract)", () => {
    expect(() => parser.parse(requirement({ asset: OTHER }), parseOptions)).toThrowError(/USDC/);
  });

  it("rejects an unsupported scheme", () => {
    expect(() => parser.parse(requirement({ scheme: "upto" }), parseOptions)).toThrowError(/scheme/i);
  });

  it("rejects a malformed amount", () => {
    expect(() => parser.parse(requirement({ maxAmountRequired: "lots" }), parseOptions)).toThrowError(/amount/i);
  });

  it("rejects a bad payTo address", () => {
    expect(() => parser.parse(requirement({ payTo: "nope" }), parseOptions)).toThrowError(/payTo/i);
  });
});

describe("X402Adapter — maps to a Core-authorizable candidate (does NOT authorize)", () => {
  const adapter = new X402Adapter({ parseOptions, chainId: 84532, decimals: 6 });

  it("produces an intent + expectation that Core must still authorize", () => {
    const c = adapter.toExecutionCandidate(requirement(), { proposalId: "p1", transactionId: "t1" });
    expect(c.intent.action_type).toBe("payment");
    expect(c.intent.payment_method).toBe("x402");
    expect(c.intent.recipient.address).toBe(getAddress(RECIPIENT));
    expect(c.expectation.chainId).toBe(84532);
    expect(c.expectation.amount).toBe("0.10");
    expect(c.expectation.allowedFunction).toBe("transfer");
  });
});

describe("FacilitatorClient + SettlementVerifier — cannot bypass Core", () => {
  function facilitator(res: Record<string, unknown>): FacilitatorTransport {
    return { async request() { return res; } };
  }

  it("refuses to settle without a Core authorization token", async () => {
    const fc = new FacilitatorClient(facilitator({ success: true }));
    await expect(fc.settle({ payload: {}, coreAuthorizationToken: null })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("settles when Core authorization is present, and verifies the settlement", async () => {
    const fc = new FacilitatorClient(
      facilitator({ success: true, txHash: "0x" + "ef".repeat(32), network: "base-sepolia", payer: RECIPIENT }),
    );
    const settlement = await fc.settle({ payload: { ok: true }, coreAuthorizationToken: "core-auth-123" });
    expect(settlement.settled).toBe(true);

    const adapter = new X402Adapter({ parseOptions, chainId: 84532, decimals: 6 });
    const candidate = adapter.toExecutionCandidate(requirement(), { proposalId: "p1", transactionId: "t1" });
    const v = new SettlementVerifier().verify({ candidate, settlement });
    expect(v.verified).toBe(true);
  });

  it("flags a settlement whose network differs from the requirement", async () => {
    const fc = new FacilitatorClient(facilitator({ success: true, txHash: "0x" + "ef".repeat(32), network: "base" }));
    const settlement = await fc.settle({ payload: {}, coreAuthorizationToken: "core-auth-123" });
    const adapter = new X402Adapter({ parseOptions, chainId: 84532, decimals: 6 });
    const candidate = adapter.toExecutionCandidate(requirement(), { proposalId: "p1", transactionId: "t1" });
    const v = new SettlementVerifier().verify({ candidate, settlement });
    expect(v.verified).toBe(false);
    expect(v.discrepancies).toContain("network");
  });
});
