/**
 * Configuration loading + validation — Phase 1, Task 1.3.
 *
 * Reads raw environment variables, validates them against the Zod schema, and
 * applies fail-closed "required for mode" checks. Invalid configuration raises a
 * ConfigurationError and the service must refuse to start rather than run in an
 * unsafe/ambiguous state.
 *
 * Secrets are never printed here.
 */
import { type CoreConfig, type CoreEnvironment, configSchema } from "./schema.js";

export class ConfigurationError extends Error {
  readonly missing: string[];
  constructor(message: string, missing: string[] = []) {
    super(message);
    this.name = "ConfigurationError";
    this.missing = missing;
  }
}

/** Map raw process env (snake/UPPER) to the schema's camelCase shape. */
function mapEnv(env: NodeJS.ProcessEnv): Record<string, unknown> {
  return {
    environment: env.CORE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    serviceName: env.SERVICE_NAME,
    version: env.SERVICE_VERSION,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    aiServiceUrl: env.AI_SERVICE_URL,
    executionServiceUrl: env.EXECUTION_SERVICE_URL,
    internalServiceToken: env.INTERNAL_SERVICE_TOKEN,
    network: env.CORE_NETWORK,
    executionMode: env.EXECUTION_MODE,
    allowMainnet: env.ALLOW_MAINNET,
    otelEnabled: env.OTEL_ENABLED,
    otelExporterEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    otelExporterHeaders: env.OTEL_EXPORTER_OTLP_HEADERS,
  };
}

/**
 * Fail-closed checks that depend on the runtime mode. Production/testnet require
 * durable infrastructure and service auth; missing values must stop startup.
 * (BACKEND_DATABASE.md §73: "database unavailable → do not authorize new execution".)
 */
function validateRequiredForMode(config: CoreConfig): string[] {
  const missing: string[] = [];
  const strict = config.environment === "production" || config.environment === "testnet";

  if (strict) {
    if (!config.databaseUrl) missing.push("DATABASE_URL");
    if (!config.redisUrl) missing.push("REDIS_URL");
  }
  if (config.environment === "production") {
    if (!config.internalServiceToken) missing.push("INTERNAL_SERVICE_TOKEN");
    if (config.otelEnabled && !config.otelExporterEndpoint) {
      missing.push("OTEL_EXPORTER_OTLP_ENDPOINT");
    }
    // Mainnet must never be implicitly enabled.
    if (config.allowMainnet && config.network.includes("sepolia")) {
      missing.push("CORE_NETWORK (mainnet allowed but network is a testnet — resolve explicitly)");
    }
  }
  return missing;
}

/**
 * Load and validate configuration. Throws ConfigurationError on invalid input.
 * Never mutates process state.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): CoreConfig {
  const parsed = configSchema.safeParse(mapEnv(env));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new ConfigurationError(
      `Invalid Sentinel Core configuration:\n  ${issues.join("\n  ")}`,
      issues,
    );
  }

  const missing = validateRequiredForMode(parsed.data);
  if (missing.length > 0) {
    throw new ConfigurationError(
      `Mode '${parsed.data.environment}' requires configuration that is missing: ` +
        `${missing.join(", ")}. Refusing to start (fail closed).`,
      missing,
    );
  }

  return parsed.data;
}

// ---- Phase 0 backward compatibility ------------------------------------ //
// Preserve the Phase 0 baseline API so existing behavior/tests remain valid.

export type { CoreEnvironment } from "./schema.js";

export interface BaselineConfig {
  readonly serviceName: string;
  readonly version: string;
  readonly environment: CoreEnvironment;
}

export function loadBaselineConfig(env: NodeJS.ProcessEnv = process.env): BaselineConfig {
  const raw = (env.CORE_ENV ?? "local").toLowerCase();
  const valid = ["local", "ci", "test", "testnet", "production"];
  return {
    serviceName: "sentinel-core",
    version: "0.1.0",
    environment: (valid.includes(raw) ? raw : "local") as CoreEnvironment,
  };
}
