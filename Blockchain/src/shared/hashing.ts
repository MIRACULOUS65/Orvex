/**
 * Deterministic payload hashing for simulation<->execution binding.
 *
 * The exact transaction that passed simulation must be the transaction that executes.
 * We compute a stable hash over the materially-significant fields; if any of them change
 * the hash changes and the prior simulation is treated as STALE (invalid).
 */
import { createHash } from "node:crypto";
import type { TransactionRequest } from "../contracts/execution-contracts.js";

/** Canonical JSON: sorted keys, so hashing is stable regardless of property order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sort(value));
}

function sort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sort((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * The material fields that define "the same transaction" for simulation binding.
 * Excludes non-executable metadata like created_at.
 */
export function transactionPayloadHash(tx: TransactionRequest): string {
  const material = {
    chainId: tx.chain.id,
    from: tx.from.toLowerCase(),
    to: tx.to.toLowerCase(),
    value: tx.value,
    data: tx.data.toLowerCase(),
    asset: tx.asset.symbol,
    assetAddress: (tx.asset.address ?? "").toLowerCase(),
    amount: tx.amount,
  };
  return sha256Hex(canonicalJson(material));
}
