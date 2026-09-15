/**
 * Typed, validated execution configuration, sourced from the environment.
 *
 * This is the ONLY place signing material enters the process. The private key is read
 * from env and never returned by any accessor that could be logged; callers that need to
 * sign get it through a narrow accessor and must not persist/log it.
 */
import { z } from "zod";
import { ExecutionError } from "../shared/errors.js";

export const ExecutionMode = z.enum(["SIMULATE", "TESTNET"]);
export type ExecutionMode = z.infer<typeof ExecutionMode>;

export interface BlockchainConfig {
  nodeEnv: string;
  executionMode: ExecutionMode;
  executionTimeoutMs: number;

  anvilRpcUrl: string;
  anvilChainId: number;

  baseSepoliaRpcUrl: string | null;
  baseSepoliaChainId: number;
  baseSepoliaUsdcAddress: string | null;

  entryPointAddress: string | null;
  bundlerUrl: string | null;
  smartAccountAddress: string | null;

  x402Network: string;
  x402FacilitatorUrl: string | null;

  attestationRegistryAddress: string | null;

  allowMainnet: boolean;

  /** Present only if a signer key was configured. Never include the raw key here. */
  readonly _hasSigner: boolean;
}

// Note: the interface above intentionally declares no field for the raw key. Access is
// via `getSignerKey(env)` below, kept separate so structured logging of `config` is safe.

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  EXECUTION_MODE: ExecutionMode.default("SIMULATE"),
  EXECUTION_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  ANVIL_RPC_URL: z.string().default("http://127.0.0.1:8545"),
  ANVIL_CHAIN_ID: z.coerce.number().int().positive().default(31337),
  BASE_SEPOLIA_RPC_URL: z.string().optional(),
  BASE_SEPOLIA_CHAIN_ID: z.coerce.number().int().positive().default(84532),
  BASE_SEPOLIA_USDC_ADDRESS: z.string().optional(),
  ENTRYPOINT_ADDRESS: z.string().optional(),
  BUNDLER_URL: z.string().optional(),
  SMART_ACCOUNT_ADDRESS: z.string().optional(),
  X402_NETWORK: z.string().default("base-sepolia"),
  X402_FACILITATOR_URL: z.string().optional(),
  ATTESTATION_REGISTRY_ADDRESS: z.string().optional(),
  ALLOW_MAINNET: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  EXECUTION_SIGNER_PRIVATE_KEY: z.string().optional(),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BlockchainConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw ExecutionError.of("CONFIG_ERROR", "Invalid blockchain configuration.", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    executionMode: e.EXECUTION_MODE,
    executionTimeoutMs: e.EXECUTION_TIMEOUT_MS,
    anvilRpcUrl: e.ANVIL_RPC_URL,
    anvilChainId: e.ANVIL_CHAIN_ID,
    baseSepoliaRpcUrl: e.BASE_SEPOLIA_RPC_URL ?? null,
    baseSepoliaChainId: e.BASE_SEPOLIA_CHAIN_ID,
    baseSepoliaUsdcAddress: e.BASE_SEPOLIA_USDC_ADDRESS ?? null,
    entryPointAddress: e.ENTRYPOINT_ADDRESS ?? null,
    bundlerUrl: e.BUNDLER_URL ?? null,
    smartAccountAddress: e.SMART_ACCOUNT_ADDRESS ?? null,
    x402Network: e.X402_NETWORK,
    x402FacilitatorUrl: e.X402_FACILITATOR_URL ?? null,
    attestationRegistryAddress: e.ATTESTATION_REGISTRY_ADDRESS ?? null,
    allowMainnet: e.ALLOW_MAINNET ?? false,
    _hasSigner: Boolean(e.EXECUTION_SIGNER_PRIVATE_KEY && e.EXECUTION_SIGNER_PRIVATE_KEY.length > 0),
  };
}

/**
 * Narrow accessor for the signer key. Returns null if unconfigured. This is the ONLY
 * function that reads the raw key; nothing logs its return value.
 */
export function getSignerKey(env: NodeJS.ProcessEnv = process.env): `0x${string}` | null {
  const raw = env.EXECUTION_SIGNER_PRIVATE_KEY;
  if (!raw) return null;
  const normalized = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw ExecutionError.of("SIGNER_UNAVAILABLE", "Configured signer key is not a valid 32-byte hex key.");
  }
  return normalized as `0x${string}`;
}

export function hasSigner(config: BlockchainConfig): boolean {
  return config._hasSigner;
}
