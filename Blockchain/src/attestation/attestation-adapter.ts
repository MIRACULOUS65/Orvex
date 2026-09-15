/**
 * AttestationAdapter — writes COMPACT COMMITMENTS to the on-chain AttestationRegistry.
 *
 * Two invariants (BLOCKCHAIN_ARCHITECTURE §14, invariant 10):
 *   1. Only fixed-size commitments (bytes32 hashes/ids + decision + txhash + timestamp).
 *      Never secrets, raw prompts, full trajectories, or proprietary evidence. The
 *      `buildCommitment` helper hashes free-form inputs into bytes32 so nothing large or
 *      sensitive is ever passed to the chain.
 *   2. Attestation is ISOLATED from payment state: a failed attestation NEVER fails a
 *      payment and NEVER changes financial state. `attest()` returns a result object and
 *      does not throw into the caller's payment path.
 */
import { encodeFunctionData, keccak256, toHex, type Address, type Hex } from "viem";

export const ATTESTATION_REGISTRY_ABI = [
  {
    type: "function",
    name: "attest",
    stateMutability: "nonpayable",
    inputs: [
      { name: "executionId", type: "bytes32" },
      { name: "agentId", type: "bytes32" },
      { name: "policyHash", type: "bytes32" },
      { name: "intentRef", type: "bytes32" },
      { name: "trajectoryRoot", type: "bytes32" },
      { name: "assessmentHash", type: "bytes32" },
      { name: "decision", type: "bytes32" },
      { name: "transactionHash", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

/** The raw inputs Core provides; free-form strings are hashed to bytes32 commitments. */
export interface AttestationInput {
  executionId: string;
  agentId: string;
  policyHash: string;
  intentRef: string;
  trajectoryRoot: string;
  assessmentHash: string;
  decision: string; // "ALLOW" | "REVIEW" | "DENY" etc.
  transactionHash: string | null;
}

export interface Commitment {
  executionId: Hex;
  agentId: Hex;
  policyHash: Hex;
  intentRef: Hex;
  trajectoryRoot: Hex;
  assessmentHash: Hex;
  decision: Hex;
  transactionHash: Hex;
}

/** A signer that can send the attestation tx. May be the same isolated key as execution. */
export interface AttestationSigner {
  sendTransaction(tx: { to: Hex; data: Hex; value: bigint }): Promise<Hex>;
}

export interface AttestationResult {
  attested: boolean;
  transactionHash: Hex | null;
  /** Set when attestation failed; the reason is informational and NON-fatal to payment. */
  error?: string;
}

/**
 * Turn free-form values into fixed 32-byte commitments. A value that is ALREADY a 0x
 * 32-byte hash is used as-is; anything else (including a plain string) is keccak256-hashed
 * so no variable-length or sensitive content reaches the chain.
 */
function toBytes32(value: string | null): Hex {
  if (!value) return ("0x" + "0".repeat(64)) as Hex;
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) return value as Hex;
  return keccak256(toHex(value));
}

export function buildCommitment(input: AttestationInput): Commitment {
  return {
    executionId: toBytes32(input.executionId),
    agentId: toBytes32(input.agentId),
    policyHash: toBytes32(input.policyHash),
    intentRef: toBytes32(input.intentRef),
    trajectoryRoot: toBytes32(input.trajectoryRoot),
    assessmentHash: toBytes32(input.assessmentHash),
    decision: toBytes32(input.decision),
    transactionHash: toBytes32(input.transactionHash),
  };
}

export class AttestationAdapter {
  constructor(
    private readonly registryAddress: Address,
    private readonly signer: AttestationSigner,
  ) {}

  /**
   * Attest a compact commitment. NEVER throws into the payment path — returns a result.
   * A failure here is logged upstream and does not affect the settled payment.
   */
  async attest(input: AttestationInput): Promise<AttestationResult> {
    try {
      const c = buildCommitment(input);
      const data = encodeFunctionData({
        abi: ATTESTATION_REGISTRY_ABI,
        functionName: "attest",
        args: [
          c.executionId,
          c.agentId,
          c.policyHash,
          c.intentRef,
          c.trajectoryRoot,
          c.assessmentHash,
          c.decision,
          c.transactionHash,
        ],
      });
      const txHash = await this.signer.sendTransaction({ to: this.registryAddress as Hex, data, value: 0n });
      return { attested: true, transactionHash: txHash };
    } catch (e) {
      // Isolation: attestation failure is non-fatal to payment. Return, never rethrow.
      const msg = e instanceof Error ? e.message : String(e);
      return { attested: false, transactionHash: null, error: msg };
    }
  }
}
