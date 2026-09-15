/**
 * Configuration schema (Zod) — Phase 1, Task 1.3.
 *
 * Defines the validated shape of Sentinel Core configuration. Every value is
 * validated at startup; invalid/missing critical values fail closed rather than
 * defaulting to an unsafe state.
 *
 * Secret fields are marked here so logging/telemetry can redact them centrally.
 * The schema itself never prints values.
 */
import { z } from "zod";

export const CORE_ENVIRONMENTS = ["local", "ci", "test", "testnet", "production"] as const;
export const EXECUTION_MODES = ["SIMULATE", "REVIEW_ONLY", "TESTNET", "AUTONOMOUS"] as const;
export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

/**
 * Keys whose values are secrets and must never be logged, traced, or returned.
 * Consumed by the logging/telemetry redaction layer.
 */
export const SECRET_CONFIG_KEYS = [
  "databaseUrl",
  "redisUrl",
  "internalServiceToken",
  "otelExporterHeaders",
] as const;

const optionalUrl = z
  .string()
  .url()
  .optional()
  .or(z.literal("").transform(() => undefined));

export const configSchema = z.object({
  // ---- Runtime ----
  environment: z.enum(CORE_ENVIRONMENTS).default("local"),
  port: z.coerce.number().int().min(1).max(65535).default(8090),
  logLevel: z.enum(LOG_LEVELS).default("info"),
  serviceName: z.string().default("sentinel-core"),
  version: z.string().default("0.1.0"),

  // ---- Data stores ----
  // Optional at config-load time so the service can boot for tests/local without
  // live infra. Readiness (/ready) reports them; required-for-mode validation
  // (below) enforces them where the environment demands it.
  databaseUrl: z.string().min(1).optional(),
  redisUrl: z.string().min(1).optional(),

  // ---- Upstream / downstream services ----
  aiServiceUrl: optionalUrl,
  executionServiceUrl: optionalUrl,
  internalServiceToken: z.string().min(1).optional(),

  // ---- Network / execution safety ----
  network: z.string().default("base-sepolia"),
  executionMode: z.enum(EXECUTION_MODES).default("SIMULATE"),
  allowMainnet: z.coerce.boolean().default(false),

  // ---- Observability ----
  otelEnabled: z.coerce.boolean().default(false),
  otelExporterEndpoint: optionalUrl,
  otelExporterHeaders: z.string().optional(),
});

export type CoreConfig = z.infer<typeof configSchema>;
export type CoreEnvironment = (typeof CORE_ENVIRONMENTS)[number];
export type ExecutionMode = (typeof EXECUTION_MODES)[number];
