import { describe, it, expect } from "vitest";
import { decodeFunctionData, getAddress, type Hex } from "viem";
import { UserOperationBuilder, SMART_ACCOUNT_ABI } from "../src/smart-account/user-operation.js";
import { BundlerClient, EntryPointClient, type BundlerTransport } from "../src/smart-account/bundler-client.js";
import { SmartAccountAdapter, type UserOpSigner } from "../src/smart-account/smart-account-adapter.js";
import { ERC20_ABI } from "../src/transactions/erc20-abi.js";
import { RECIPIENT, USDC } from "./helpers/fixtures.js";

const SA = "0x4444444444444444444444444444444444444444" as const;
const OWNER = "0x5555555555555555555555555555555555555555" as const;
const ENTRYPOINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as const;

function bundlerTransport(overrides: {
  receiptSuccess?: boolean;
  noReceipt?: boolean;
  failSend?: boolean;
} = {}): BundlerTransport {
  const sent: unknown[] = [];
  return {
    async request(method, params) {
      switch (method) {
        case "epx_getNonce":
          return "0x0";
        case "eth_estimateUserOperationGas":
          return { callGasLimit: "0x30d40", verificationGasLimit: "0x30d40", preVerificationGas: "0xea60" };
        case "eth_sendUserOperation": {
          if (overrides.failSend) throw new Error("bundler down");
          sent.push(params[0]);
          return ("0x" + "ab".repeat(32)) as Hex;
        }
        case "eth_getUserOperationReceipt":
          if (overrides.noReceipt) return null;
          return { success: overrides.receiptSuccess ?? true, receipt: { transactionHash: "0x" + "cd".repeat(32) } };
        default:
          throw new Error(`unhandled ${method}`);
      }
    },
  };
}

const computeUserOpHash = (): Hex => ("0x" + "11".repeat(32)) as Hex;

function signer(): UserOpSigner & { signedHashes: Hex[]; sawKey: boolean } {
  const signedHashes: Hex[] = [];
  return {
    ownerAddress: getAddress(OWNER),
    signedHashes,
    sawKey: false,
    async signUserOpHash(h) {
      signedHashes.push(h);
      return ("0x" + "22".repeat(65)) as Hex;
    },
  };
}

describe("UserOperationBuilder", () => {
  it("wraps a USDC transfer inside smart-account execute(dest,value,func)", () => {
    const op = new UserOperationBuilder().build({
      sender: getAddress(SA),
      nonce: 3n,
      token: getAddress(USDC),
      recipient: getAddress(RECIPIENT),
      amountUnits: 5_000_000n,
      gas: { callGasLimit: 1n, verificationGasLimit: 1n, preVerificationGas: 1n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
    });
    expect(op.sender).toBe(getAddress(SA));
    expect(op.nonce).toBe(3n);
    // Decode execute() and its inner transfer.
    const outer = decodeFunctionData({ abi: SMART_ACCOUNT_ABI, data: op.callData });
    expect(outer.functionName).toBe("execute");
    const [dest, value, func] = outer.args as [`0x${string}`, bigint, `0x${string}`];
    expect(getAddress(dest)).toBe(getAddress(USDC));
    expect(value).toBe(0n);
    const inner = decodeFunctionData({ abi: ERC20_ABI, data: func });
    expect(inner.functionName).toBe("transfer");
    const [to, amt] = inner.args as [`0x${string}`, bigint];
    expect(getAddress(to)).toBe(getAddress(RECIPIENT));
    expect(amt).toBe(5_000_000n);
  });
});

describe("SmartAccountAdapter — 4337 lifecycle (offline)", () => {
  function adapter(t: BundlerTransport, s: UserOpSigner) {
    const bundler = new BundlerClient(t, getAddress(ENTRYPOINT));
    const ep = new EntryPointClient(t, getAddress(ENTRYPOINT));
    return new SmartAccountAdapter(bundler, ep, s);
  }

  const execParams = {
    smartAccount: getAddress(SA),
    token: getAddress(USDC),
    recipient: getAddress(RECIPIENT),
    amountUnits: 5_000_000n,
    maxFeePerGas: 1_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    computeUserOpHash,
  };

  it("builds -> estimates -> signs -> sends -> CONFIRMED, and signs the userOpHash", async () => {
    const s = signer();
    const res = await adapter(bundlerTransport({ receiptSuccess: true }), s).execute(execParams, 3000);
    expect(res.status).toBe("CONFIRMED");
    expect(res.transactionHash).toBeTruthy();
    expect(s.signedHashes.length).toBe(1);
  });

  it("refuses to send an unsigned UserOperation (signature required)", async () => {
    const badSigner: UserOpSigner = { ownerAddress: getAddress(OWNER), async signUserOpHash() { return "0x" as Hex; } };
    await expect(adapter(bundlerTransport(), badSigner).execute(execParams, 2000)).rejects.toMatchObject({
      code: "SUBMISSION_FAILED",
    });
  });

  it("submission failure => UNKNOWN (never blind-retry)", async () => {
    await expect(adapter(bundlerTransport({ failSend: true }), signer()).execute(execParams, 2000)).rejects.toMatchObject({
      code: "UNKNOWN",
    });
  });

  it("no receipt within timeout => UNKNOWN", async () => {
    const res = await adapter(bundlerTransport({ noReceipt: true }), signer()).execute(execParams, 1200);
    expect(res.status).toBe("UNKNOWN");
    expect(res.transactionHash).toBeNull();
  });

  it("failed UserOp receipt => FAILED", async () => {
    const res = await adapter(bundlerTransport({ receiptSuccess: false }), signer()).execute(execParams, 3000);
    expect(res.status).toBe("FAILED");
  });
});
