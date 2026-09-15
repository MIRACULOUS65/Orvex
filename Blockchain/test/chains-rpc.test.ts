import { describe, it, expect } from "vitest";
import { ChainRegistry, BASE_SEPOLIA } from "../src/chains/chain-registry.js";
import { RpcProvider } from "../src/rpc/rpc-provider.js";
import { isExecutionError } from "../src/shared/errors.js";
import { mockTransport } from "./helpers/mock-transport.js";

describe("ChainRegistry", () => {
  const reg = new ChainRegistry();

  it("resolves base-sepolia by network and chain id", () => {
    const c = reg.getByNetwork("base-sepolia");
    expect(c.chainId).toBe(84532);
    expect(reg.getByChainId(84532)?.network).toBe("base-sepolia");
  });

  it("exposes USDC with 6 decimals on base-sepolia", () => {
    expect(reg.usdc("base-sepolia").decimals).toBe(6);
  });

  it("throws on unknown network", () => {
    try {
      reg.getByNetwork("nope");
      expect.unreachable();
    } catch (e) {
      expect(isExecutionError(e) && e.code).toBe("CONFIG_ERROR");
    }
  });

  it("allows overriding the base-sepolia USDC address from config", () => {
    const r2 = new ChainRegistry({ baseSepoliaUsdcAddress: "0x1111111111111111111111111111111111111111" });
    expect(r2.usdc("base-sepolia").address).toBe("0x1111111111111111111111111111111111111111");
  });
});

describe("RpcProvider chain-match guard", () => {
  it("accepts a matching RPC-reported chain id", async () => {
    const p = new RpcProvider({
      chain: BASE_SEPOLIA,
      rpcUrl: null,
      allowMainnet: false,
      transport: mockTransport({ chainId: 84532 }),
    });
    await expect(p.assertConfiguredChain()).resolves.toBe(84532);
  });

  it("rejects when the RPC reports a different chain id", async () => {
    const p = new RpcProvider({
      chain: BASE_SEPOLIA,
      rpcUrl: null,
      allowMainnet: false,
      transport: mockTransport({ chainId: 1 }),
    });
    await expect(p.assertConfiguredChain()).rejects.toMatchObject({ code: "CHAIN_MISMATCH" });
  });

  it("rejects when the requested chain id differs from configured", async () => {
    const p = new RpcProvider({
      chain: BASE_SEPOLIA,
      rpcUrl: null,
      allowMainnet: false,
      transport: mockTransport({ chainId: 84532 }),
    });
    await expect(p.assertChainForRequest(1)).rejects.toMatchObject({ code: "CHAIN_MISMATCH" });
  });

  it("MAINNET SAFETY: blocks a mainnet chain before any network contact", () => {
    const reg = new ChainRegistry();
    const mainnet = reg.getByNetwork("base");
    expect(() =>
      new RpcProvider({ chain: mainnet, rpcUrl: "http://x", allowMainnet: false, transport: mockTransport({ chainId: 8453 }) }),
    ).toThrowError(/blocked/i);
  });

  it("permits mainnet only when explicitly allowed", () => {
    const reg = new ChainRegistry();
    const mainnet = reg.getByNetwork("base");
    expect(
      () => new RpcProvider({ chain: mainnet, rpcUrl: null, allowMainnet: true, transport: mockTransport({ chainId: 8453 }) }),
    ).not.toThrow();
  });
});
