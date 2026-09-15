/**
 * Narrow RPC provider abstraction (viem-backed) + the chain-match safety guard.
 *
 * Higher layers never touch a viem client directly. The provider enforces:
 *   - MAINNET SAFETY: a chain flagged isMainnet is rejected before ANY network contact,
 *     unless ALLOW_MAINNET was explicitly enabled (V1 never enables it).
 *   - CHAIN MATCH: configured chainId == RPC-reported chainId == requested chainId.
 *     Any mismatch throws CHAIN_MISMATCH; nothing executes on the wrong chain.
 *
 * The concrete viem transport is injectable so tests use a deterministic mock transport
 * (no network). Production uses http(rpcUrl).
 */
import {
  createPublicClient,
  http,
  type Chain,
  type PublicClient,
  type Transport,
  type Hex,
  type Address,
} from "viem";
import { ExecutionError } from "../shared/errors.js";
import type { ChainDefinition } from "../chains/chain-registry.js";

export interface RpcProviderOptions {
  chain: ChainDefinition;
  rpcUrl: string | null;
  allowMainnet: boolean;
  /** Injectable transport for tests. Defaults to http(rpcUrl). */
  transport?: Transport;
}

function toViemChain(def: ChainDefinition): Chain {
  return {
    id: def.chainId,
    name: def.displayName,
    nativeCurrency: { name: def.nativeCurrency.symbol, symbol: def.nativeCurrency.symbol, decimals: def.nativeCurrency.decimals },
    rpcUrls: { default: { http: [] } },
  } as Chain;
}

export class RpcProvider {
  readonly chain: ChainDefinition;
  private readonly client: PublicClient;
  private verifiedChainId: number | null = null;

  constructor(opts: RpcProviderOptions) {
    // MAINNET SAFETY: hard gate before any client is even constructed against a URL.
    if (opts.chain.isMainnet && !opts.allowMainnet) {
      throw ExecutionError.of("MAINNET_BLOCKED", "Mainnet execution is blocked in this configuration.", {
        network: opts.chain.network,
        chainId: opts.chain.chainId,
      });
    }
    if (!opts.transport && !opts.rpcUrl) {
      throw ExecutionError.of("CONFIG_ERROR", "No RPC URL configured for network.", {
        network: opts.chain.network,
      });
    }
    this.chain = opts.chain;
    const transport = opts.transport ?? http(opts.rpcUrl!);
    this.client = createPublicClient({ chain: toViemChain(opts.chain), transport });
  }

  /** Underlying viem client — internal use only (simulation/receipt modules). */
  get viem(): PublicClient {
    return this.client;
  }

  /**
   * Verify configured chainId == RPC-reported chainId. Cached after first success.
   * Throws CHAIN_MISMATCH on divergence. Call before any simulate/execute.
   */
  async assertConfiguredChain(): Promise<number> {
    if (this.verifiedChainId !== null) return this.verifiedChainId;
    let reported: number;
    try {
      reported = await this.client.getChainId();
    } catch (cause) {
      throw ExecutionError.of("RPC_ERROR", "Failed to read chain id from RPC.", { network: this.chain.network }, cause);
    }
    if (reported !== this.chain.chainId) {
      throw ExecutionError.of("CHAIN_MISMATCH", "RPC-reported chain id does not match configured chain.", {
        configured: this.chain.chainId,
        reported,
        network: this.chain.network,
      });
    }
    this.verifiedChainId = reported;
    return reported;
  }

  /**
   * Full triple-match: configured == RPC-reported == requested. Any executable path must
   * pass this with the chainId the transaction claims.
   */
  async assertChainForRequest(requestedChainId: number): Promise<void> {
    if (requestedChainId !== this.chain.chainId) {
      throw ExecutionError.of("CHAIN_MISMATCH", "Requested chain id does not match configured chain.", {
        configured: this.chain.chainId,
        requested: requestedChainId,
        network: this.chain.network,
      });
    }
    await this.assertConfiguredChain();
  }

  async getBlockNumber(): Promise<bigint> {
    return this.client.getBlockNumber();
  }

  async getBalance(address: Address): Promise<bigint> {
    return this.client.getBalance({ address });
  }

  async getCode(address: Address): Promise<Hex | undefined> {
    return this.client.getCode({ address });
  }
}
