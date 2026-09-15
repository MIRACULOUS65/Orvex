/**
 * TransactionBuilder — turns an authorized TransactionIntent into a concrete, executable
 * TransactionRequest for an ERC-20 USDC transfer.
 *
 * Rules:
 *   - Exact integer token units (bigint) via shared/money; NEVER float.
 *   - Calldata is viem-encoded `transfer(to, amount)`; `to` is the token contract, the
 *     recipient is inside calldata (this is what the decoder/validator later checks).
 *   - The chain is resolved from the ChainRegistry by the intent's network; the USDC
 *     asset address must be known for that network (else UNSUPPORTED).
 *   - The builder authorizes ONLY plain USDC transfers in V1. Anything else is rejected
 *     here (defense in depth; the validator re-checks the decoded transaction too).
 */
import { encodeFunctionData, getAddress, isAddress, type Address } from "viem";
import { ExecutionError } from "../shared/errors.js";
import { toBaseUnits } from "../shared/money.js";
import type { ChainRegistry } from "../chains/chain-registry.js";
import type { TransactionIntent, TransactionRequest } from "../contracts/execution-contracts.js";
import { ERC20_ABI } from "./erc20-abi.js";

export interface BuildContext {
  /** The executor/sender address (smart account or EOA). Never a private key. */
  from: string;
  /** Stable transaction id to stamp onto the request (usually intent.transaction_id). */
  transactionId?: string;
}

export class TransactionBuilder {
  constructor(private readonly registry: ChainRegistry) {}

  build(intent: TransactionIntent, ctx: BuildContext): TransactionRequest {
    if (intent.action_type !== "payment" && intent.action_type !== "transfer") {
      throw ExecutionError.of("BUILD_ERROR", "Unsupported action_type for V1 USDC transfer.", {
        action_type: intent.action_type,
      });
    }
    if (intent.asset.symbol !== "USDC") {
      throw ExecutionError.of("UNSUPPORTED", "V1 only builds USDC transfers.", { asset: intent.asset.symbol });
    }

    const chain = this.registry.getByNetwork(intent.network);
    const usdc = this.registry.usdc(intent.network);
    if (!usdc.address) {
      throw ExecutionError.of("CONFIG_ERROR", "USDC address not configured for network.", {
        network: intent.network,
      });
    }

    const from = this.requireAddress(ctx.from, "from");
    const recipient = this.requireAddress(intent.recipient.address, "recipient");
    const tokenAddress = this.requireAddress(usdc.address, "token");

    // Exact integer base units — no float anywhere on the money path.
    const units = toBaseUnits(intent.amount, usdc.decimals);
    if (units <= 0n) {
      throw ExecutionError.of("BUILD_ERROR", "Transfer amount must be positive.", { amount: intent.amount });
    }

    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [recipient, units],
    });

    const req: TransactionRequest = {
      schema_version: "transaction_request.v1",
      transaction_id: ctx.transactionId ?? intent.transaction_id,
      chain: { id: chain.chainId, name: chain.network },
      from,
      // For an ERC-20 transfer the tx `to` is the TOKEN contract; recipient is in calldata.
      to: tokenAddress,
      value: "0",
      data,
      asset: { symbol: usdc.symbol, address: tokenAddress, type: "erc20" },
      amount: intent.amount,
      proposal_id: intent.proposal_id,
      intent_id: intent.transaction_id,
      created_at: new Date().toISOString(),
    };
    return req;
  }

  private requireAddress(value: string, field: string): Address {
    if (!value || !isAddress(value)) {
      throw ExecutionError.of("BUILD_ERROR", `Invalid ${field} address.`, { field, value });
    }
    // Checksum-normalize so hashing/compare is stable.
    return getAddress(value);
  }
}
