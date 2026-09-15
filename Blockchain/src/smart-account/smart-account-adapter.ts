/**
 * SmartAccountAdapter — ERC-4337 execution mechanism.
 *
 * Lifecycle: build UserOp -> estimate gas -> sign the userOpHash (isolated signer) ->
 * send via bundler -> await UserOp receipt. The signer produces ONLY a signature over the
 * userOpHash; the raw key never leaves the signer and never reaches the bundler.
 *
 * The smart account is an execution mechanism, NOT an authorization engine — the request
 * it executes was already authorized by Core and validated/simulated upstream.
 */
import { getAddress, type Address, type Hex } from "viem";
import { ExecutionError, isExecutionError } from "../shared/errors.js";
import { UserOperationBuilder, type UserOperation } from "./user-operation.js";
import type { BundlerClient, EntryPointClient } from "./bundler-client.js";

/** Signs a userOpHash. Backed by the isolated key; never exposes it. */
export interface UserOpSigner {
  /** The smart-account owner/signer address. */
  ownerAddress: Address;
  signUserOpHash(userOpHash: Hex): Promise<Hex>;
}

export interface SmartAccountExecuteParams {
  smartAccount: Address;
  token: Address;
  recipient: Address;
  amountUnits: bigint;
  /** EIP-1559 fees, from the RPC. */
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  /** Computes the userOpHash to sign (EntryPoint domain). Injectable for tests. */
  computeUserOpHash: (op: UserOperation) => Hex;
}

export interface SmartAccountExecuteResult {
  userOpHash: Hex;
  transactionHash: Hex | null;
  success: boolean;
  status: "CONFIRMED" | "PENDING" | "FAILED" | "UNKNOWN";
}

export class SmartAccountAdapter {
  private readonly builder = new UserOperationBuilder();

  constructor(
    private readonly bundler: BundlerClient,
    private readonly entryPoint: EntryPointClient,
    private readonly signer: UserOpSigner,
  ) {}

  async execute(params: SmartAccountExecuteParams, timeoutMs = 60_000): Promise<SmartAccountExecuteResult> {
    const sender = getAddress(params.smartAccount);
    const nonce = await this.entryPoint.getNonce(sender);

    // 1. Build the unsigned UserOp with placeholder gas.
    let op = this.builder.build({
      sender,
      nonce,
      token: params.token,
      recipient: params.recipient,
      amountUnits: params.amountUnits,
      gas: {
        callGasLimit: 200_000n,
        verificationGasLimit: 200_000n,
        preVerificationGas: 60_000n,
        maxFeePerGas: params.maxFeePerGas,
        maxPriorityFeePerGas: params.maxPriorityFeePerGas,
      },
    });

    // 2. Estimate gas from the bundler and apply.
    try {
      const est = await this.bundler.estimateUserOperationGas(op);
      op = { ...op, ...est };
    } catch (cause) {
      throw ExecutionError.of("SIMULATION_FAILED", "Bundler rejected UserOperation gas estimation.", undefined, cause);
    }

    // 3. Sign the userOpHash with the ISOLATED signer. Key never leaves here.
    const userOpHash = params.computeUserOpHash(op);
    const signature = await this.signer.signUserOpHash(userOpHash);
    op = { ...op, signature };

    // 4. Send via the bundler (never receives the key).
    let sentHash: Hex;
    try {
      sentHash = await this.bundler.sendUserOperation(op);
    } catch (cause) {
      // A deterministic pre-broadcast rejection (e.g. refusing an unsigned op) is FAILED,
      // not UNKNOWN. Only genuine send-time uncertainty (network) becomes UNKNOWN.
      if (isExecutionError(cause) && cause.code === "SUBMISSION_FAILED") {
        throw cause;
      }
      throw ExecutionError.of("UNKNOWN", "UserOperation submission uncertain.", { userOpHash }, cause);
    }

    // 5. Await the UserOp receipt.
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const receipt = await this.bundler.getUserOperationReceipt(sentHash);
      if (receipt) {
        return {
          userOpHash: sentHash,
          transactionHash: receipt.transactionHash,
          success: receipt.success,
          status: receipt.success ? "CONFIRMED" : "FAILED",
        };
      }
      await sleep(500);
    }
    // No receipt in time => UNKNOWN, reconcile later.
    return { userOpHash: sentHash, transactionHash: null, success: false, status: "UNKNOWN" };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
