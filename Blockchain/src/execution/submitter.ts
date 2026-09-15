/**
 * Submitter — the ONLY component that touches signing material.
 *
 * It builds a viem WalletClient from a private key (supplied by config, never logged) and
 * broadcasts the exact validated + simulated transaction. The key never leaves this
 * module; nothing here serializes/returns/logs it.
 *
 * A `Signer` seam is used so tests can inject a deterministic in-memory signer without a
 * real key, and so the real key path (privateKeyToAccount) is isolated and swappable.
 */
import {
  createWalletClient,
  http,
  getAddress,
  type Account,
  type Chain,
  type Hex,
  type Transport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ExecutionError } from "../shared/errors.js";
import type { ChainDefinition } from "../chains/chain-registry.js";
import type { TransactionRequest } from "../contracts/execution-contracts.js";

export interface Signer {
  /** Sender address this signer controls. */
  address: `0x${string}`;
  /** Sign + send the transaction, returning the tx hash. Never exposes the key. */
  sendTransaction(tx: { to: Hex; data: Hex; value: bigint; chainId: number }): Promise<Hex>;
}

function toViemChain(def: ChainDefinition): Chain {
  return {
    id: def.chainId,
    name: def.displayName,
    nativeCurrency: { name: def.nativeCurrency.symbol, symbol: def.nativeCurrency.symbol, decimals: def.nativeCurrency.decimals },
    rpcUrls: { default: { http: [] } },
  } as Chain;
}

/**
 * Real key-backed signer. Constructed only inside the execution boundary from a key that
 * came from config/secret provider. The `privateKeyToAccount` call is the single point
 * where key material is materialized into an Account.
 */
export function createKeySigner(params: {
  privateKey: `0x${string}`;
  chain: ChainDefinition;
  rpcUrl: string;
  transport?: Transport;
}): Signer {
  let account: Account;
  try {
    account = privateKeyToAccount(params.privateKey);
  } catch (cause) {
    throw ExecutionError.of("SIGNER_UNAVAILABLE", "Invalid signer key.", undefined, cause);
  }
  const client = createWalletClient({
    account,
    chain: toViemChain(params.chain),
    transport: params.transport ?? http(params.rpcUrl),
  });
  return {
    address: account.address,
    async sendTransaction(tx) {
      if (tx.chainId !== params.chain.chainId) {
        throw ExecutionError.of("CHAIN_MISMATCH", "Signer chain does not match transaction chain.", {
          signer: params.chain.chainId,
          tx: tx.chainId,
        });
      }
      return client.sendTransaction({
        account,
        chain: toViemChain(params.chain),
        to: tx.to,
        data: tx.data,
        value: tx.value,
      });
    },
  };
}

export class Submitter {
  constructor(private readonly signer: Signer) {}

  get sender(): `0x${string}` {
    return this.signer.address;
  }

  /**
   * Broadcast the transaction. The `from` in the request must be the signer's address —
   * we never sign for a different sender than the one that was validated/simulated.
   */
  async submit(tx: TransactionRequest): Promise<Hex> {
    if (getAddress(tx.from) !== getAddress(this.signer.address)) {
      throw ExecutionError.of("SUBMISSION_FAILED", "Transaction sender does not match the configured signer.", {
        txFrom: getAddress(tx.from),
        signer: getAddress(this.signer.address),
      });
    }
    try {
      return await this.signer.sendTransaction({
        to: tx.to as Hex,
        data: tx.data as Hex,
        value: BigInt(tx.value),
        chainId: tx.chain.id,
      });
    } catch (cause) {
      throw ExecutionError.of("SUBMISSION_FAILED", "Failed to broadcast transaction.", { transaction_id: tx.transaction_id }, cause);
    }
  }
}
