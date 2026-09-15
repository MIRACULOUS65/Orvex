/**
 * Execution client provider — the SINGLE, minimal Core seam for selecting the concrete
 * ExecutionClient at the composition root.
 *
 * Core's default remains the deterministic MockExecutionClient (built inside
 * buildContainer). Only when `executionMode === "TESTNET"` does this provider load the
 * real Base Sepolia execution client from the separate `@sentinelpay/blockchain` package
 * via a DYNAMIC import — so Core's compiled code never statically imports viem/RPC/wallet/
 * signer, and the blockchain package is an optional runtime dependency.
 *
 * The real client is returned as the abstract `ExecutionClient`; Core does not learn any
 * blockchain-specific type. Signing keys are read only inside the blockchain package from
 * its own environment — never here, never in Core, never logged.
 *
 * If TESTNET is configured but the real client cannot be built (missing RPC/key/package),
 * this throws — a misconfigured TESTNET deployment must fail loudly, not silently fall
 * back to a mock (which would be unsafe: it would report success without executing).
 */
import type { ExecutionClient } from "../../application/clients/execution/index.js";
import type { CoreConfig } from "../../config/index.js";
import { getLogger } from "../../shared/logging/index.js";

export interface ExecutionClientSelection {
  /** undefined => let buildContainer use its MockExecutionClient default. */
  client?: ExecutionClient;
  /** The blockchain authorized-context registry (present only for the real client). */
  authorizedContextRegistry?: unknown;
  mode: string;
}

/**
 * Resolve the execution client for the given Core config. Pure w.r.t. Core; the only side
 * effect is a dynamic import when TESTNET is active.
 */
export async function resolveExecutionClient(config: CoreConfig): Promise<ExecutionClientSelection> {
  // Mainnet is never permitted here regardless of mode.
  if (config.allowMainnet && !config.network.includes("sepolia")) {
    throw new Error("Refusing to build a mainnet execution client (allowMainnet on a non-testnet network).");
  }

  if (config.executionMode !== "TESTNET") {
    // SIMULATE / REVIEW_ONLY / AUTONOMOUS keep the deterministic mock (no chain).
    return { mode: config.executionMode };
  }

  // TESTNET: load the real Base Sepolia client from the blockchain package (dynamic).
  let mod: {
    buildBaseSepoliaExecutionClient: (opts?: { env?: NodeJS.ProcessEnv }) => {
      client: ExecutionClient;
      registry: unknown;
    };
  };
  try {
    // Dynamic specifier so bundlers/Core typecheck don't statically require the package.
    const specifier = "@sentinelpay/blockchain";
    mod = (await import(/* @vite-ignore */ specifier)) as typeof mod;
  } catch (err) {
    throw new Error(
      `EXECUTION_MODE=TESTNET requires the @sentinelpay/blockchain package to be installed and built. ${(err as Error).message}`,
    );
  }

  const { client, registry } = mod.buildBaseSepoliaExecutionClient({ env: process.env });
  getLogger().info("execution_client_selected", { mode: "TESTNET", network: config.network });
  return { client, authorizedContextRegistry: registry, mode: "TESTNET" };
}
