/**
 * ERC-4337 UserOperation types + builder (EntryPoint v0.7 packed shape).
 *
 * The UserOperationBuilder constructs a UserOp for a single ERC-20 USDC transfer executed
 * through a smart account's `execute(dest, value, func)` call. It performs NO signing and
 * NO network I/O — signing happens in the SmartAccountAdapter via the isolated signer, and
 * gas/nonce come from the bundler/EntryPoint clients. Amounts stay bigint.
 */
import { encodeFunctionData, type Address, type Hex } from "viem";
import { ERC20_ABI } from "../transactions/erc20-abi.js";

/** Minimal smart-account `execute(address,uint256,bytes)` ABI (common SA convention). */
export const SMART_ACCOUNT_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "dest", type: "address" },
      { name: "value", type: "uint256" },
      { name: "func", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

/** EntryPoint v0.7 UserOperation (unpacked view we work with before packing). */
export interface UserOperation {
  sender: Address;
  nonce: bigint;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  /** paymasterAndData omitted (self-sponsored) unless a paymaster is configured. */
  paymaster?: Address | null;
  signature: Hex;
}

export interface BuildUserOpParams {
  sender: Address;
  nonce: bigint;
  /** The ERC-20 USDC transfer to wrap in `execute`. */
  token: Address;
  recipient: Address;
  amountUnits: bigint;
  gas: {
    callGasLimit: bigint;
    verificationGasLimit: bigint;
    preVerificationGas: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  };
}

export class UserOperationBuilder {
  /** Build the unsigned UserOperation for a USDC transfer via the smart account. */
  build(params: BuildUserOpParams): UserOperation {
    const transferData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [params.recipient, params.amountUnits],
    });
    const callData = encodeFunctionData({
      abi: SMART_ACCOUNT_ABI,
      functionName: "execute",
      args: [params.token, 0n, transferData],
    });
    return {
      sender: params.sender,
      nonce: params.nonce,
      callData,
      callGasLimit: params.gas.callGasLimit,
      verificationGasLimit: params.gas.verificationGasLimit,
      preVerificationGas: params.gas.preVerificationGas,
      maxFeePerGas: params.gas.maxFeePerGas,
      maxPriorityFeePerGas: params.gas.maxPriorityFeePerGas,
      paymaster: null,
      // Signed later by the adapter; placeholder for gas estimation.
      signature: "0x" as Hex,
    };
  }
}
