/**
 * Deterministic Simulator — real EVM semantics via viem (simulateContract / eth_call).
 *
 * Produces the frozen SimulationResult contract. Critically, it BINDS the result to the
 * exact transaction payload hash. The execution path later calls `assertFresh(sim, tx)`;
 * if the payload changed materially since simulation, the old simulation is STALE and
 * execution is blocked (BLOCKCHAIN_ARCHITECTURE §8/§10, invariant 6).
 *
 * A natural-language "it should work" is never a simulation. This calls the chain.
 */
import { getAddress, type Address } from "viem";
import { ExecutionError } from "../shared/errors.js";
import { fromBaseUnits } from "../shared/money.js";
import { transactionPayloadHash } from "../shared/hashing.js";
import type { RpcProvider } from "../rpc/rpc-provider.js";
import type { ChainRegistry } from "../chains/chain-registry.js";
import type { SimulationResult, TransactionRequest } from "../contracts/execution-contracts.js";
import { ERC20_ABI } from "../transactions/erc20-abi.js";
import { TransactionDecoder } from "../transactions/transaction-decoder.js";

const SIMULATOR_VERSION = "1.0.0";

/** SimulationResult plus the internal binding hash (not part of the Core contract). */
export interface BoundSimulation {
  result: SimulationResult;
  /** Hash of the exact payload that was simulated. */
  payloadHash: string;
}

export class Simulator {
  private readonly decoder = new TransactionDecoder();

  constructor(
    private readonly rpc: RpcProvider,
    private readonly registry: ChainRegistry,
  ) {}

  /**
   * Simulate an ERC-20 USDC transfer. Uses `simulateContract` (which performs an eth_call
   * against current state) to determine revert/pass, plus a balance check to distinguish
   * INSUFFICIENT_FUNDS. Deterministic: same state + same payload => same result.
   */
  async simulate(tx: TransactionRequest): Promise<BoundSimulation> {
    // Chain must match before we trust any simulation.
    await this.rpc.assertChainForRequest(tx.chain.id);

    const decoded = this.decoder.decode(tx);
    const payloadHash = transactionPayloadHash(tx);
    const now = () => new Date().toISOString();
    const simulator = { provider: "viem-eth_call", version: SIMULATOR_VERSION };

    if (!decoded.known || decoded.functionName !== "transfer" || !decoded.target || decoded.amountUnits === null) {
      // We only deterministically simulate USDC transfers in V1.
      return {
        payloadHash,
        result: {
          schema_version: "simulation_result.v1",
          transaction_id: tx.transaction_id,
          status: "UNSUPPORTED",
          would_revert: true,
          gas_estimate: null,
          expected_state_changes: [],
          unexpected_state_changes: [],
          revert_reason: "unsupported_or_unknown_function",
          simulator,
          simulated_at: now(),
        },
      };
    }

    const token = getAddress(tx.to) as Address;
    const from = getAddress(tx.from) as Address;
    const to = decoded.target;
    const amountUnits = decoded.amountUnits;
    const decimals = this.registry.usdc(tx.chain.name).decimals;

    // 1. Balance check -> distinguishes INSUFFICIENT_FUNDS from generic REVERT.
    let balance: bigint | null = null;
    try {
      balance = (await this.rpc.viem.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [from],
      })) as bigint;
    } catch {
      balance = null; // Non-fatal; simulateContract below is authoritative.
    }
    if (balance !== null && balance < amountUnits) {
      return {
        payloadHash,
        result: {
          schema_version: "simulation_result.v1",
          transaction_id: tx.transaction_id,
          status: "INSUFFICIENT_FUNDS",
          would_revert: true,
          gas_estimate: null,
          expected_state_changes: [],
          unexpected_state_changes: [],
          revert_reason: "insufficient_balance",
          simulator,
          simulated_at: now(),
        },
      };
    }

    // 2. Real EVM simulation (eth_call under the hood).
    try {
      await this.rpc.viem.simulateContract({
        account: from,
        address: token,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [to, amountUnits],
      });
    } catch (cause) {
      const reason = extractRevertReason(cause);
      return {
        payloadHash,
        result: {
          schema_version: "simulation_result.v1",
          transaction_id: tx.transaction_id,
          status: reason.insufficient ? "INSUFFICIENT_FUNDS" : "REVERT",
          would_revert: true,
          gas_estimate: null,
          expected_state_changes: [],
          unexpected_state_changes: [],
          revert_reason: reason.message,
          simulator,
          simulated_at: now(),
        },
      };
    }

    // 3. Gas estimate (best-effort; failure does not fail the sim).
    let gas: string | null = null;
    try {
      const g = await this.rpc.viem.estimateContractGas({
        account: from,
        address: token,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [to, amountUnits],
      });
      gas = g.toString();
    } catch {
      gas = null;
    }

    return {
      payloadHash,
      result: {
        schema_version: "simulation_result.v1",
        transaction_id: tx.transaction_id,
        status: "PASS",
        would_revert: false,
        gas_estimate: gas ? { gas } : null,
        expected_state_changes: [
          { type: "erc20_transfer", asset: "USDC", from, to, amount: fromBaseUnits(amountUnits, decimals) },
        ],
        unexpected_state_changes: [],
        revert_reason: null,
        simulator,
        simulated_at: now(),
      },
    };
  }

  /**
   * STALE-SIMULATION GUARD. Throws if the current transaction payload differs from the
   * one that was simulated. The exact transaction that passed simulation must execute.
   */
  static assertFresh(sim: BoundSimulation, tx: TransactionRequest): void {
    const current = transactionPayloadHash(tx);
    if (current !== sim.payloadHash) {
      throw ExecutionError.of("STALE_SIMULATION", "Transaction payload changed since simulation; prior simulation is invalid.", {
        simulated: sim.payloadHash,
        current,
      });
    }
    if (sim.result.status !== "PASS") {
      throw ExecutionError.of("SIMULATION_FAILED", "Simulation did not pass; execution blocked.", {
        status: sim.result.status,
        revert_reason: sim.result.revert_reason,
      });
    }
  }
}

function extractRevertReason(cause: unknown): { message: string; insufficient: boolean } {
  const parts: string[] = [];
  const pick = (obj: unknown, key: string): void => {
    if (obj && typeof obj === "object" && key in obj) {
      const v = (obj as Record<string, unknown>)[key];
      if (typeof v === "string" && v) parts.push(v);
    }
  };
  // viem surfaces revert text across several fields; collect whichever are present.
  pick(cause, "shortMessage");
  pick(cause, "details");
  pick(cause, "metaMessages");
  if (cause && typeof cause === "object" && "cause" in cause) {
    pick((cause as { cause: unknown }).cause, "details");
    pick((cause as { cause: unknown }).cause, "shortMessage");
  }
  if (parts.length === 0) {
    parts.push(cause instanceof Error ? cause.message : String(cause));
  }
  const message = parts.join(" | ") || "reverted";
  const insufficient = /insufficient|balance|exceeds/i.test(message);
  return { message, insufficient };
}
