/**
 * Secret redaction — Phase 1, Task 1.4.
 *
 * Central redaction used by logging, error serialization, and telemetry. Redacts
 * both by field name (keys that look like secrets) and by string pattern (bearer
 * tokens, key=value pairs). Must run before anything is written to stdout, a span,
 * or an API response (BACKEND_SECURITY.md §46-47, §82).
 */

export const REDACTED = "***REDACTED***";

const SENSITIVE_KEY_HINTS = [
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "api_key",
  "api-key",
  "authorization",
  "auth",
  "cookie",
  "session",
  "private_key",
  "privatekey",
  "seed",
  "seed_phrase",
  "mnemonic",
  "signing",
  "signer",
  "bearer",
  "credential",
  "database_url",
  "databaseurl",
  "redis_url",
  "redisurl",
];

const BEARER_PATTERN = /(?<=bearer\s)[A-Za-z0-9._\-]+/gi;
const KV_SECRET_PATTERN = new RegExp(
  `(["']?(?:${SENSITIVE_KEY_HINTS.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})["']?\\s*[:=]\\s*)(["']?)([^\\s,"'}]+)`,
  "gi",
);
// URLs with embedded credentials: scheme://user:pass@host
const URL_CREDENTIAL_PATTERN = /(\w+:\/\/[^:\s/]+:)([^@\s]+)(@)/gi;

export function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEY_HINTS.some((hint) => k.includes(hint));
}

export function redactString(input: string): string {
  return input
    .replace(URL_CREDENTIAL_PATTERN, `$1${REDACTED}$3`)
    .replace(BEARER_PATTERN, REDACTED)
    .replace(KV_SECRET_PATTERN, `$1$2${REDACTED}`);
}

/**
 * Deep-redact a value for safe logging. Objects are traversed; keys that look like
 * secrets have their values replaced; strings are pattern-scrubbed. Cyclic
 * references and excessive depth are guarded.
 */
export function redactValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth > 8) return "[TRUNCATED]";

  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, depth + 1, seen));
  }
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  if (typeof value === "object") {
    if (seen.has(value as object)) return "[CIRCULAR]";
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? REDACTED : redactValue(v, depth + 1, seen);
    }
    return out;
  }
  return String(value);
}
