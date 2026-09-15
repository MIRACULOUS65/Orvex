/**
 * ReceiptParser — extracts the ACTUAL on-chain effects from a transaction receipt.
 *
 * For a USDC transfer we parse the ERC-20 `Transfer(from,to,value)` event log emitted by
 * the token contract. RPC "status: success" is NOT enough — we read what really moved.
 */
import { decodeEventLog, getAddress, type Address, type Hex } from "viem";
import { ERC20_ABI } from "../transactions/erc20-abi.js";

export interface ParsedTransfer {
  token: Address;
  from: Address;
  to: Address;
  valueUnits: bigint;
}

export interface RawReceipt {
  transactionHash: Hex;
  status: "success" | "reverted";
  from: Address;
  to: Address | null;
  logs: { address: Address; topics: Hex[]; data: Hex }[];
}

export interface ParsedReceipt {
  transactionHash: Hex;
  success: boolean;
  transfers: ParsedTransfer[];
}

export class ReceiptParser {
  parse(receipt: RawReceipt): ParsedReceipt {
    const transfers: ParsedTransfer[] = [];
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: ERC20_ABI,
          data: log.data,
          topics: log.topics as [Hex, ...Hex[]],
        });
        if (decoded.eventName === "Transfer") {
          const args = decoded.args as unknown as { from: Address; to: Address; value: bigint };
          transfers.push({
            token: getAddress(log.address),
            from: getAddress(args.from),
            to: getAddress(args.to),
            valueUnits: args.value,
          });
        }
      } catch {
        // Not an ERC-20 Transfer log we understand; ignore for USDC verification.
      }
    }
    return {
      transactionHash: receipt.transactionHash,
      success: receipt.status === "success",
      transfers,
    };
  }
}
