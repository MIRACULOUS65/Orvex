/**
 * TransactionAnalyzer — produces the frozen TransactionAnalysis contract from the decoded
 * transaction. This is what Core's `validateTransaction()` returns.
 *
 * It classifies the transaction and raises risk flags. It does NOT decide authorization
 * (Core does); it reports VALID / SUSPICIOUS / INVALID based on what the bytes really do.
 */
import { getAddress } from "viem";
import { fromBaseUnits } from "../shared/money.js";
import type { ChainRegistry } from "../chains/chain-registry.js";
import type { TransactionAnalysis, TransactionRequest } from "../contracts/execution-contracts.js";
import { TransactionDecoder, type DecodedTransaction } from "./transaction-decoder.js";

export class TransactionAnalyzer {
  private readonly decoder = new TransactionDecoder();

  constructor(private readonly registry: ChainRegistry) {}

  analyze(tx: TransactionRequest): TransactionAnalysis {
    const decoded = this.decoder.decode(tx);
    const usdc = this.safeUsdc(tx.chain.name);
    const decimals = usdc?.decimals ?? 6;

    const riskFlags: string[] = [];
    let status: TransactionAnalysis["status"] = "VALID";

    if (!decoded.known) {
      riskFlags.push("unknown_function");
      status = "INVALID";
    } else if (decoded.functionName === "approve") {
      // Approvals (esp. unlimited) are a classic redirection/drain vector.
      riskFlags.push("approval");
      if (decoded.amountUnits !== null && decoded.amountUnits >= (1n << 255n)) {
        riskFlags.push("unlimited_approval");
      }
      status = "SUSPICIOUS";
    } else if (decoded.functionName === "transferFrom") {
      riskFlags.push("transfer_from");
      status = "SUSPICIOUS";
    }

    // Native value on an ERC-20 op is unexpected.
    if (tx.value !== "0") {
      riskFlags.push("nonzero_native_value");
      if (status === "VALID") status = "SUSPICIOUS";
    }

    const recipient = decoded.target ?? "";
    const amount =
      decoded.amountUnits !== null ? fromBaseUnits(decoded.amountUnits, decimals) : "0";

    return {
      schema_version: "transaction_analysis.v1",
      transaction_id: tx.transaction_id,
      contract: { address: getAddress(tx.to), verified: Boolean(usdc?.address) },
      function: { name: decoded.functionName ?? "unknown", selector: decoded.selector },
      decoded_arguments: decoded.args,
      state_changes_expected:
        decoded.functionName === "transfer" && decoded.target
          ? [{ type: "erc20_transfer", asset: "USDC", from: tx.from, to: recipient, amount }]
          : [],
      recipient,
      amount,
      asset: tx.asset.symbol,
      risk_flags: riskFlags,
      status,
    };
  }

  /** Expose decode for validators/tests. */
  decode(tx: TransactionRequest): DecodedTransaction {
    return this.decoder.decode(tx);
  }

  private safeUsdc(network: string) {
    try {
      return this.registry.usdc(network);
    } catch {
      return null;
    }
  }
}
