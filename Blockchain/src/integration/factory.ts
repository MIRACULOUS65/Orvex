/**
 * Execution client factory — config-driven selection of the concrete ExecutionClient.
 *
 * This is what Core wires in. Core's buildContainer stays unchanged in shape: it receives
 * an `ExecutionClient` and does not know which concrete implementation is active.
 *
 * Modes (from EXECUTION_MODE / config):
 *   - SIMULATE  => a client whose execute() validates+simulates but never broadcasts.
 *   - TESTNET   => the real BaseSepoliaExecutionClient (requires RPC + signer + resolver).
 *
 * Mainnet is impossible here: the ChainRegistry + RpcProvider hard-gate mainnet, and this
 * factory only ever constructs Base Sepolia / Anvil chains.
 */
import { ChainRegistry } from "../chains/chain-registry.js";
import { RpcProvider } from "../rpc/rpc-provider.js";
import { Submitter, createKeySigner } from "../execution/submitter.js";
import { BaseSepoliaExecutionClient, type AuthorizedContextResolver } from "../execution/base-sepolia-execution-client.js";
import { AuthorizedContextRegistry } from "./authorized-context-registry.js";
import { loadConfig, getSignerKey, type BlockchainConfig } from "../config/config.js";
import { ExecutionError } from "../shared/errors.js";
import type { ExecutionClient } from "../contracts/execution-contracts.js";

export interface BuildExecutionClientResult {
  client: ExecutionClient;
  /** Core registers authorized contexts here at authorization time. */
  registry: AuthorizedContextRegistry;
  config: BlockchainConfig;
}

export interface BuildExecutionClientOptions {
  env?: NodeJS.ProcessEnv;
  /** Override the resolver (e.g. a DB-backed one). Defaults to the in-memory registry. */
  resolver?: AuthorizedContextResolver & { register?: AuthorizedContextRegistry["register"] };
}

/**
 * Build the real Base Sepolia execution client from environment configuration.
 * Requires BASE_SEPOLIA_RPC_URL + EXECUTION_SIGNER_PRIVATE_KEY. Throws CONFIG_ERROR /
 * SIGNER_UNAVAILABLE otherwise (so a misconfigured TESTNET deployment fails loudly rather
 * than silently doing nothing).
 */
export function buildBaseSepoliaExecutionClient(options: BuildExecutionClientOptions = {}): BuildExecutionClientResult {
  const env = options.env ?? process.env;
  const config = loadConfig(env);

  if (!config.baseSepoliaRpcUrl) {
    throw ExecutionError.of("CONFIG_ERROR", "BASE_SEPOLIA_RPC_URL is required for the real execution client.");
  }
  const key = getSignerKey(env);
  if (!key) {
    throw ExecutionError.of("SIGNER_UNAVAILABLE", "EXECUTION_SIGNER_PRIVATE_KEY is required for the real execution client.");
  }

  const registry = new ChainRegistry({ baseSepoliaUsdcAddress: config.baseSepoliaUsdcAddress });
  const chain = registry.getByNetwork("base-sepolia");
  const rpc = new RpcProvider({ chain, rpcUrl: config.baseSepoliaRpcUrl, allowMainnet: config.allowMainnet });
  const signer = createKeySigner({ privateKey: key, chain, rpcUrl: config.baseSepoliaRpcUrl });
  const submitter = new Submitter(signer);

  const ctxRegistry = new AuthorizedContextRegistry();
  const resolver = options.resolver ?? ctxRegistry;

  const client = new BaseSepoliaExecutionClient({
    rpc,
    registry,
    submitter,
    resolver,
    timeoutMs: config.executionTimeoutMs,
  });

  return { client, registry: ctxRegistry, config };
}
