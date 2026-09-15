/**
 * BundlerClient + EntryPointClient — the ERC-4337 network seams.
 *
 * These talk to a bundler RPC (eth_sendUserOperation / eth_estimateUserOperationGas /
 * eth_getUserOperationReceipt) and to the EntryPoint contract (getNonce). Both are behind
 * a narrow transport seam so tests inject deterministic responses with no network.
 *
 * No signing happens here. The bundler never receives a private key — only a signed
 * UserOperation.
 */
import { getAddress, type Address, type Hex } from "viem";
import { ExecutionError } from "../shared/errors.js";
import type { UserOperation } from "./user-operation.js";

/** A minimal JSON-RPC transport for the bundler (method + params -> result). */
export interface BundlerTransport {
  request(method: string, params: unknown[]): Promise<unknown>;
}

export interface UserOpGasEstimate {
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
}

export interface UserOpReceipt {
  userOpHash: Hex;
  success: boolean;
  transactionHash: Hex | null;
}

/** Serialize a UserOperation to the hex/JSON shape bundlers expect (v0.7 fields). */
function toRpcUserOp(op: UserOperation): Record<string, string> {
  const hex = (v: bigint) => `0x${v.toString(16)}`;
  return {
    sender: op.sender,
    nonce: hex(op.nonce),
    callData: op.callData,
    callGasLimit: hex(op.callGasLimit),
    verificationGasLimit: hex(op.verificationGasLimit),
    preVerificationGas: hex(op.preVerificationGas),
    maxFeePerGas: hex(op.maxFeePerGas),
    maxPriorityFeePerGas: hex(op.maxPriorityFeePerGas),
    signature: op.signature,
  };
}

export class BundlerClient {
  constructor(
    private readonly transport: BundlerTransport,
    private readonly entryPoint: Address,
  ) {}

  async estimateUserOperationGas(op: UserOperation): Promise<UserOpGasEstimate> {
    const res = (await this.transport.request("eth_estimateUserOperationGas", [
      toRpcUserOp(op),
      this.entryPoint,
    ])) as { callGasLimit: string; verificationGasLimit: string; preVerificationGas: string };
    return {
      callGasLimit: BigInt(res.callGasLimit),
      verificationGasLimit: BigInt(res.verificationGasLimit),
      preVerificationGas: BigInt(res.preVerificationGas),
    };
  }

  async sendUserOperation(op: UserOperation): Promise<Hex> {
    if (!op.signature || op.signature === "0x") {
      throw ExecutionError.of("SUBMISSION_FAILED", "Refusing to send an unsigned UserOperation.");
    }
    const hash = (await this.transport.request("eth_sendUserOperation", [toRpcUserOp(op), this.entryPoint])) as Hex;
    return hash;
  }

  async getUserOperationReceipt(userOpHash: Hex): Promise<UserOpReceipt | null> {
    const res = (await this.transport.request("eth_getUserOperationReceipt", [userOpHash])) as
      | { success: boolean; receipt?: { transactionHash?: string } }
      | null;
    if (!res) return null;
    return {
      userOpHash,
      success: Boolean(res.success),
      transactionHash: res.receipt?.transactionHash ? (res.receipt.transactionHash as Hex) : null,
    };
  }
}

/** Reads the smart-account nonce from the EntryPoint (via the same bundler transport). */
export class EntryPointClient {
  constructor(
    private readonly transport: BundlerTransport,
    readonly address: Address,
  ) {}

  static normalize(address: string): Address {
    return getAddress(address);
  }

  async getNonce(sender: Address, key = 0n): Promise<bigint> {
    // In production this is an eth_call to EntryPoint.getNonce(sender,key). The transport
    // seam lets tests return a deterministic nonce.
    const res = (await this.transport.request("epx_getNonce", [sender, `0x${key.toString(16)}`])) as string;
    return BigInt(res);
  }
}
