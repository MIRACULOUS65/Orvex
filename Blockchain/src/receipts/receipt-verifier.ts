/**
 * ReceiptVerifier — independent AUTHORIZED-vs-ACTUAL comparison producing the frozen
 * ReceiptVerification contract.
 *
 * Central invariant (BLOCKCHAIN_ARCHITECTURE §13): a successful RPC receipt is NOT
 * financial success. We compare what Core authorized (recipient/asset/amount/network)
 * against what actually happened on-chain (parsed Transfer event). Any mismatch =>
 * verified:false with discrepancies; Core then refuses to commit.
 */
import { getAddress, type Address } from "viem";
import { fromBaseUnits, toBaseUnits } from "../shared/money.js";
import type { ParsedReceipt } from "./receipt-parser.js";
import type { ReceiptSnapshot, ReceiptVerification } from "../contracts/execution-contracts.js";

export interface AuthorizedReceipt {
  recipient: string;
  asset: string;
  /** Decimal string, exact. */
  amount: string;
  network: string;
  /** The USDC token contract for the network. */
  tokenAddress: string;
  decimals: number;
}

export class ReceiptVerifier {
  verify(params: {
    executionId: string;
    authorized: AuthorizedReceipt;
    parsed: ParsedReceipt;
    /** The chain the receipt actually came from (from the RPC/chain the client used). */
    actualNetwork: string;
  }): ReceiptVerification {
    const { executionId, authorized, parsed, actualNetwork } = params;
    const discrepancies: string[] = [];

    // 1. Transaction must have succeeded at the EVM level.
    if (!parsed.success) discrepancies.push("tx_reverted");

    // 2. Find the USDC Transfer matching the authorized token + recipient.
    const token = safeAddress(authorized.tokenAddress);
    const recipient = safeAddress(authorized.recipient);
    const authorizedUnits = toBaseUnits(authorized.amount, authorized.decimals);

    const matching = parsed.transfers.find(
      (t) => token && recipient && getAddress(t.token) === token && getAddress(t.to) === recipient,
    );

    let actualRecipient = "";
    let actualAmount = "0";

    if (!matching) {
      // No transfer to the authorized recipient of the authorized token.
      discrepancies.push("recipient");
      // Surface whatever the first transfer was (if any) for forensics.
      const first = parsed.transfers[0];
      if (first) {
        actualRecipient = first.to;
        actualAmount = fromBaseUnits(first.valueUnits, authorized.decimals);
        if (safeAddress(first.token) !== token) discrepancies.push("asset");
      } else {
        discrepancies.push("no_transfer");
      }
    } else {
      actualRecipient = matching.to;
      actualAmount = fromBaseUnits(matching.valueUnits, authorized.decimals);
      if (matching.valueUnits !== authorizedUnits) discrepancies.push("amount");
    }

    // 3. Network binding.
    if (authorized.network !== actualNetwork) discrepancies.push("network");

    const verified = discrepancies.length === 0;

    const expected: ReceiptSnapshot = {
      recipient: recipient ?? authorized.recipient,
      asset: authorized.asset,
      amount: authorized.amount,
      network: authorized.network,
    };
    const actual: ReceiptSnapshot = {
      recipient: actualRecipient || (recipient ?? authorized.recipient),
      asset: authorized.asset,
      amount: verified ? authorized.amount : actualAmount,
      network: actualNetwork,
    };

    return {
      schema_version: "receipt_verification.v1",
      execution_id: executionId,
      verified,
      transaction_hash: parsed.transactionHash,
      expected,
      actual,
      discrepancies,
      verified_at: new Date().toISOString(),
    };
  }
}

function safeAddress(v: string): Address | null {
  try {
    return getAddress(v);
  } catch {
    return null;
  }
}
