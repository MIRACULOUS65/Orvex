/**
 * Fastify application factory — Phase 1, Task 1.7.
 *
 * Wires correlation, structured error handling, and route registration. The API
 * layer contains no domain/policy logic (BACKEND_ARCHITECTURE.md §6.1). Business
 * logic lives in application/domain/control-engine layers added in later phases.
 *
 * `buildApp` is pure and injectable so tests construct an app without touching
 * global state; `bootstrap` performs process-level startup (config, logger, OTel).
 */
import Fastify, { type FastifyInstance } from "fastify";

import { getConfig, setConfigForTests, type CoreConfig } from "../config/index.js";
import { configureLogger, getLogger } from "../shared/logging/index.js";
import { configureTelemetry } from "../shared/telemetry/index.js";
import { registerCorrelation } from "./middleware/correlation.js";
import { registerErrorHandler } from "./middleware/error-handler.js";
import { registerSystemRoutes, type SystemRouteOptions } from "./routes/system.js";
import { registerV1Routes } from "./routes/v1.js";
import { buildContainer, type Container } from "./http/container.js";
import { resolveExecutionClient } from "./http/execution-client-provider.js";
import { getPrisma } from "../repositories/prisma.js";

export interface BuildAppOptions {
  system?: SystemRouteOptions;
  /** Optional body size cap (bytes). Defaults to a conservative limit. */
  bodyLimit?: number;
  /** Injected service container (tests provide one bound to an isolated DB). */
  container?: Container;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // we use our own structured logger (also disables request logging)
    bodyLimit: options.bodyLimit ?? 256 * 1024, // 256 KB cap (BACKEND_SECURITY.md §52)
    requestIdHeader: false,
  });

  registerCorrelation(app);
  registerErrorHandler(app);
  await registerSystemRoutes(app, options.system);

  let container = options.container;
  if (!container) {
    // Config-driven execution client selection (default: Mock; TESTNET: real Base Sepolia
    // via the separate blockchain package). Core stays free of blockchain-specific types.
    const selection = await resolveExecutionClient(getConfig());
    container = buildContainer({ db: getPrisma(), executionClient: selection.client });
  }
  await registerV1Routes(app, container);

  return app;
}

/**
 * Full process bootstrap: validate config (fail-closed), configure logger + OTel,
 * then build the app. Used by the server entrypoint.
 */
export async function bootstrap(config?: CoreConfig): Promise<{ app: FastifyInstance; config: CoreConfig }> {
  const resolved = config ?? getConfig();
  if (config) setConfigForTests(resolved);

  configureLogger({ service: resolved.serviceName, level: resolved.logLevel });
  await configureTelemetry({
    enabled: resolved.otelEnabled,
    serviceName: resolved.serviceName,
    exporterEndpoint: resolved.otelExporterEndpoint,
  });

  const app = await buildApp();
  getLogger().info("core_bootstrapped", {
    environment: resolved.environment,
    network: resolved.network,
    execution_mode: resolved.executionMode,
    otel_enabled: resolved.otelEnabled,
  });
  return { app, config: resolved };
}
