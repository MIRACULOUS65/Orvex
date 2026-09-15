/**
 * Exact money conversion. NEVER JavaScript floating point for token amounts.
 *
 * A human decimal string (e.g. "5.25") is converted to exact integer base units
 * (bigint) for a given token decimals count (e.g. USDC = 6 -> 5250000n). Conversion is
 * lossless and rejects anything it cannot represent exactly.
 */
import { ExecutionError } from "./errors.js";

const DECIMAL_RE = /^(\d+)(?:\.(\d+))?$/;

/**
 * Parse a non-negative decimal string into exact integer base units.
 * Rejects negatives, exponents, and more fractional digits than `decimals`.
 */
export function toBaseUnits(amount: string, decimals: number): bigint {
  if (typeof amount !== "string" || amount.trim() === "") {
    throw ExecutionError.of("BUILD_ERROR", "Amount must be a non-empty decimal string.", { amount });
  }
  const m = DECIMAL_RE.exec(amount.trim());
  if (!m) {
    throw ExecutionError.of("BUILD_ERROR", "Amount is not a valid non-negative decimal.", { amount });
  }
  const whole = m[1] ?? "0";
  const frac = m[2] ?? "";
  if (frac.length > decimals) {
    throw ExecutionError.of("BUILD_ERROR", "Amount has more fractional digits than the asset supports.", {
      amount,
      decimals,
    });
  }
  const paddedFrac = frac.padEnd(decimals, "0");
  const combined = `${whole}${paddedFrac}`.replace(/^0+(?=\d)/, "");
  return BigInt(combined === "" ? "0" : combined);
}

/** Convert exact integer base units back to a canonical decimal string. */
export function fromBaseUnits(units: bigint, decimals: number): string {
  if (units < 0n) {
    throw ExecutionError.of("BUILD_ERROR", "Base units cannot be negative.", { units: units.toString() });
  }
  if (decimals === 0) return units.toString();
  const s = units.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac === "" ? whole : `${whole}.${frac}`;
}

/** True iff two decimal strings represent the exact same value at the given decimals. */
export function amountsEqual(a: string, b: string, decimals: number): boolean {
  return toBaseUnits(a, decimals) === toBaseUnits(b, decimals);
}
