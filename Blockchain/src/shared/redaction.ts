/**
 * Signer-isolation guard. Signing material must never leave the execution boundary and
 * must never be logged. This module provides a redactor used by the logging-safe paths
 * and a compile-time-free runtime assertion used in tests to prove secrets don't leak.
 */

const SECRET_KEY_RE = /(private[_-]?key|privkey|signer[_-]?key|mnemonic|seed[_-]?phrase|secret)/i;
// A raw 0x-prefixed 64-hex private key pattern (32 bytes). Redacted if it appears anywhere.
const RAW_PRIVKEY_RE = /0x[0-9a-fA-F]{64}/g;

export const REDACTED = "[REDACTED]";

/** Recursively redact secret-looking keys/values from an object for safe logging. */
export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(RAW_PRIVKEY_RE, REDACTED);
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? REDACTED : redactSecrets(v);
    }
    return out;
  }
  return value;
}

/** True if the serialized form of `value` contains anything that looks like a raw key. */
export function containsRawSecret(value: unknown): boolean {
  const s = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return RAW_PRIVKEY_RE.test(s);
}
