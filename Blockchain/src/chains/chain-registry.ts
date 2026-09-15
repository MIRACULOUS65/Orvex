/**
 * ChainRegistry — owns network metadata. No raw chain ids scattered in code.
 *
 * V1 supports LOCAL Anvil and Base Sepolia. Base Mainnet is intentionally represented
 * only as a KNOWN-but-BLOCKED entry so the mainnet-safety guard has something concrete
 * to reject; it is never selectable unless ALLOW_MAINNET is explicitly enabled.
 */
import { ExecutionError } from "../shared/errors.js";

export interface AssetDefinition {
  symbol: string;
  address: string | null;
  decimals: number;
}

export interface ChainDefinition {
  key: string;
  /** Canonical network name used across Core contracts (e.g. "base-sepolia"). */
  network: string;
  chainId: number;
  displayName: string;
  isTestnet: boolean;
  isMainnet: boolean;
  nativeCurrency: { symbol: string; decimals: number };
  explorer: string | null;
  /** x402 network identifier (may equal `network`). */
  x402Network: string | null;
  assets: Record<string, AssetDefinition>;
}

/** USDC has 6 decimals on Base networks. */
const USDC_DECIMALS = 6;

export const ANVIL: ChainDefinition = {
  key: "anvil",
  network: "anvil",
  chainId: 31337,
  displayName: "Local Anvil",
  isTestnet: true,
  isMainnet: false,
  nativeCurrency: { symbol: "ETH", decimals: 18 },
  explorer: null,
  x402Network: null,
  // Local USDC-like token address is injected at deploy time; default null.
  assets: { USDC: { symbol: "USDC", address: null, decimals: USDC_DECIMALS } },
};

export const BASE_SEPOLIA: ChainDefinition = {
  key: "base-sepolia",
  network: "base-sepolia",
  chainId: 84532,
  displayName: "Base Sepolia",
  isTestnet: true,
  isMainnet: false,
  nativeCurrency: { symbol: "ETH", decimals: 18 },
  explorer: "https://sepolia.basescan.org",
  x402Network: "base-sepolia",
  assets: {
    USDC: {
      symbol: "USDC",
      // Circle testnet USDC on Base Sepolia. Overridable via env at registry build.
      address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      decimals: USDC_DECIMALS,
    },
  },
};

/** Known-but-blocked. Present only so the mainnet guard can reject it explicitly. */
export const BASE_MAINNET: ChainDefinition = {
  key: "base",
  network: "base",
  chainId: 8453,
  displayName: "Base Mainnet",
  isTestnet: false,
  isMainnet: true,
  nativeCurrency: { symbol: "ETH", decimals: 18 },
  explorer: "https://basescan.org",
  x402Network: "base",
  assets: {
    USDC: { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: USDC_DECIMALS },
  },
};

export interface ChainRegistryOptions {
  /** Overrides for asset addresses / rpc, sourced from env (never hard-coded secrets). */
  baseSepoliaUsdcAddress?: string | null;
  anvilUsdcAddress?: string | null;
}

export class ChainRegistry {
  private readonly byNetwork = new Map<string, ChainDefinition>();
  private readonly byChainId = new Map<number, ChainDefinition>();

  constructor(opts: ChainRegistryOptions = {}) {
    const anvil: ChainDefinition = {
      ...ANVIL,
      assets: { USDC: { ...ANVIL.assets.USDC!, address: opts.anvilUsdcAddress ?? null } },
    };
    const baseSepolia: ChainDefinition = {
      ...BASE_SEPOLIA,
      assets: {
        USDC: {
          ...BASE_SEPOLIA.assets.USDC!,
          address: opts.baseSepoliaUsdcAddress ?? BASE_SEPOLIA.assets.USDC!.address,
        },
      },
    };
    for (const c of [anvil, baseSepolia, BASE_MAINNET]) {
      this.byNetwork.set(c.network, c);
      this.byChainId.set(c.chainId, c);
    }
  }

  /** Look up by canonical network name (e.g. "base-sepolia"). Throws if unknown. */
  getByNetwork(network: string): ChainDefinition {
    const c = this.byNetwork.get(network);
    if (!c) {
      throw ExecutionError.of("CONFIG_ERROR", "Unknown network.", {
        network,
        known: [...this.byNetwork.keys()],
      });
    }
    return c;
  }

  getByChainId(chainId: number): ChainDefinition | undefined {
    return this.byChainId.get(chainId);
  }

  /** The USDC asset definition for a network (throws if the network has no USDC). */
  usdc(network: string): AssetDefinition {
    const c = this.getByNetwork(network);
    const usdc = c.assets.USDC;
    if (!usdc) {
      throw ExecutionError.of("UNSUPPORTED", "Network does not define USDC.", { network });
    }
    return usdc;
  }

  list(): ChainDefinition[] {
    return [...this.byNetwork.values()];
  }
}
