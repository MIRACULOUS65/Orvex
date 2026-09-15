/**
 * Health / readiness checks — Phase 1, Task 1.8.
 *
 * liveness(): process is up (no external calls).
 * readiness(): checks required local dependencies + required configuration for the
 *   active mode. Optional providers (AI, execution) do NOT block readiness unless
 *   configured as required (BACKEND_API.md §18, plan Task 1.8).
 *
 * Phase 1 note: PostgreSQL/Redis clients are installed but live connection probing
 * is wired in later phases. Readiness reports configuration presence now and is
 * structured so real connection probes drop in without changing the contract.
 */
import type { CoreConfig } from "../../config/index.js";

export interface DependencyStatus {
  status: "ok" | "not_configured" | "unavailable" | "skipped";
  detail?: string;
}

export interface ReadinessReport {
  ready: boolean;
  dependencies: Record<string, DependencyStatus>;
}

export function liveness(config: CoreConfig): { status: "ok"; service: string; version: string } {
  return { status: "ok", service: config.serviceName, version: config.version };
}

/**
 * Optional injectable probes so integration tests / later phases can supply real
 * PostgreSQL/Redis connection checks without changing this contract.
 */
export interface ReadinessProbes {
  postgres?: () => Promise<boolean>;
  redis?: () => Promise<boolean>;
}

export async function readiness(config: CoreConfig, probes: ReadinessProbes = {}): Promise<ReadinessReport> {
  const strict = config.environment === "production" || config.environment === "testnet";
  const dependencies: Record<string, DependencyStatus> = {};

  dependencies.postgres = await checkDependency(config.databaseUrl, probes.postgres, strict);
  dependencies.redis = await checkDependency(config.redisUrl, probes.redis, strict);

  // Configuration readiness: required-for-mode values must be present.
  dependencies.configuration = { status: "ok" };
  if (strict && (!config.databaseUrl || !config.redisUrl)) {
    dependencies.configuration = {
      status: "unavailable",
      detail: "required datastore configuration missing for this mode",
    };
  }

  const ready = Object.values(dependencies).every(
    (d) => d.status === "ok" || d.status === "not_configured" || d.status === "skipped",
  );
  return { ready, dependencies };
}

async function checkDependency(
  url: string | undefined,
  probe: (() => Promise<boolean>) | undefined,
  requiredForMode: boolean,
): Promise<DependencyStatus> {
  if (!url) {
    // In strict modes a missing required datastore is a readiness failure.
    return requiredForMode
      ? { status: "unavailable", detail: "not configured (required for mode)" }
      : { status: "not_configured" };
  }
  if (!probe) {
    // Configured but no live probe supplied (Phase 1). Report configured presence.
    return { status: "skipped", detail: "configured; live probe added in a later phase" };
  }
  try {
    const ok = await probe();
    return ok ? { status: "ok" } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}
