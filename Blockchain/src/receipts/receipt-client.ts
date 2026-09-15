/**
 * ReceiptClient — fetches a transaction receipt from the chain and normalizes it into a
 * RawReceipt for the parser.
 *
 * Distinguishes three outcomes:
 *   - found + mined  => RawReceipt
 *   - not yet mined  => null (PENDING; caller decides to wait/UNKNOWN)
 *   - lookup error   => throws RPC_ERROR (never silently "success")
 */
import { getAddress, type Address, type Hex } from "viem";
import { ExecutionError } from "../shared/errors.js";
import type { RpcProvider } from "../rpc/rpc-provider.js";
import type { RawReceipt } from "./receipt-parser.js";

export class ReceiptClient {
  constructor(private readonly rpc: RpcProvider) {}

  async getReceipt(txHash: Hex): Promise<RawReceipt | null> {
    try {
      const r = await this.rpc.viem.getTransactionReceipt({ hash: txHash });
      return {
        transactionHash: r.transactionHash,
        status: r.status,
        from: getAddress(r.from) as Address,
        to: r.to ? (getAddress(r.to) as Address) : null,
        logs: r.logs.map((l) => ({
          address: getAddress(l.address) as Address,
          topics: l.topics as Hex[],
          data: l.data as Hex,
        })),
      };
    } catch (cause) {
      // viem throws TransactionReceiptNotFoundError when not yet mined.
      const name = cause && typeof cause === "object" && "name" in cause ? String((cause as { name: unknown }).name) : "";
      if (/NotFound/i.test(name)) return null;
      throw ExecutionError.of("RPC_ERROR", "Failed to fetch transaction receipt.", { txHash }, cause);
    }
  }

  /** Wait for a receipt with bounded polling. Returns null if it never mines in time. */
  async waitForReceipt(txHash: Hex, timeoutMs: number, pollMs = 1000): Promise<RawReceipt | null> {
    const deadline = Date.now() + timeoutMs;
    // First try viem's own waiter (fast path).
    try {
      const r = await this.rpc.viem.waitForTransactionReceipt({ hash: txHash, timeout: timeoutMs });
      return {
        transactionHash: r.transactionHash,
        status: r.status,
        from: getAddress(r.from) as Address,
        to: r.to ? (getAddress(r.to) as Address) : null,
        logs: r.logs.map((l) => ({ address: getAddress(l.address) as Address, topics: l.topics as Hex[], data: l.data as Hex })),
      };
    } catch {
      // Fall back to manual polling until the deadline.
      while (Date.now() < deadline) {
        const r = await this.getReceipt(txHash);
        if (r) return r;
        await sleep(pollMs);
      }
      return null;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
