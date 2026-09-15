/**
 * Server entrypoint — Phase 1.
 *
 * Loads + validates configuration (fail-closed), bootstraps the app, and listens.
 * A ConfigurationError here stops the process rather than starting in an unsafe
 * state. Graceful shutdown closes the Fastify instance.
 */
import { getConfig } from "./config/index.js";
import { ConfigurationError } from "./config/env.js";
import { bootstrap } from "./api/app.js";
import { getLogger } from "./shared/logging/index.js";

async function main(): Promise<void> {
  let config;
  try {
    config = getConfig();
  } catch (err) {
    if (err instanceof ConfigurationError) {
      // Do not print secret values; ConfigurationError messages contain only keys.
      process.stderr.write(`[FATAL] ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const { app } = await bootstrap(config);
  const logger = getLogger();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info("shutdown_initiated", { signal });
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: "0.0.0.0", port: config.port });
  logger.info("core_listening", { port: config.port, environment: config.environment });
}

main().catch((err) => {
  process.stderr.write(`[FATAL] Failed to start Sentinel Core: ${(err as Error).message}\n`);
  process.exit(1);
});
