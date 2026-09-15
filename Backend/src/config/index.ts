/**
 * Configuration singleton — Phase 1, Task 1.3.
 *
 * Provides a single validated CoreConfig for the process. Loaded lazily on first
 * access so imports never trigger validation side effects at module load time
 * (important for tests that construct their own config).
 */
import { type CoreConfig, SECRET_CONFIG_KEYS } from "./schema.js";
import { loadConfig } from "./env.js";

let cached: CoreConfig | null = null;

export function getConfig(): CoreConfig {
  if (cached === null) {
    cached = loadConfig();
  }
  return cached;
}

/** Test/bootstrap helper: override or reset the cached config. */
export function setConfigForTests(config: CoreConfig | null): void {
  cached = config;
}

/**
 * A redacted, log-safe view of the configuration. Secret values are replaced with
 * a marker; presence is still observable for diagnostics.
 */
export function redactedConfig(config: CoreConfig): Record<string, unknown> {
  const secrets = new Set<string>(SECRET_CONFIG_KEYS);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (secrets.has(key)) {
      out[key] = value === undefined || value === null ? null : "***REDACTED***";
    } else {
      out[key] = value;
    }
  }
  return out;
}

export * from "./schema.js";
export * from "./env.js";
