/**
 * System routes — Phase 1, Task 1.8.
 *   GET /health   — liveness (BACKEND_API.md §17)
 *   GET /ready    — readiness with dependency checks (§18)
 *   GET /version  — service/version metadata (§19)
 *
 * These are operational endpoints (not the /v1 tenant API) and are unauthenticated
 * so orchestrators/monitors can probe them.
 */
import type { FastifyInstance } from "fastify";

import { getConfig } from "../../config/index.js";
import { liveness, readiness, type ReadinessProbes } from "../health/checks.js";

export interface SystemRouteOptions {
  probes?: ReadinessProbes;
}

export async function registerSystemRoutes(
  app: FastifyInstance,
  options: SystemRouteOptions = {},
): Promise<void> {
  app.get("/health", async () => liveness(getConfig()));

  app.get("/ready", async (_req, reply) => {
    const report = await readiness(getConfig(), options.probes ?? {});
    reply.code(report.ready ? 200 : 503);
    return { status: report.ready ? "ready" : "not_ready", dependencies: report.dependencies };
  });

  app.get("/version", async () => {
    const config = getConfig();
    return {
      service: config.serviceName,
      version: config.version,
      api_version: "v1",
      environment: config.environment,
      network: config.network,
      execution_mode: config.executionMode,
    };
  });
}
