/**
 * Deterministic content hashing — Phase 3+.
 *
 * Produces a stable sha256 over a canonicalized JSON value. Used for constitution
 * hashes, policy version hashes, decision context hashes, and audit chaining. Object
 * keys are sorted recursively so logically-equal content always hashes identically,
 * regardless of key order.
 */
import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = canonicalize(obj[key]);
    }
    return out;
  }
  return value;
}

/** sha256 hex over the canonical JSON form of `value`, prefixed `sha256:`. */
export function sha256Json(value: unknown): string {
  const json = JSON.stringify(canonicalize(value));
  return `sha256:${createHash("sha256").update(json).digest("hex")}`;
}
