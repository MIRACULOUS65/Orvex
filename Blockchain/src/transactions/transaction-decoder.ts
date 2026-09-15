/**
 * TransactionDecoder — derives what a transaction REALLY does from its bytes.
 *
 * The agent's natural-language explanation is NOT transaction truth. We decode the
 * function selector + arguments from calldata using the ERC-20 ABI. Unknown selectors
 * are reported as such (never guessed).
 */
import { decodeFunctionData, getAddress, slice, type Address } from "viem";
import { ExecutionError } from "../shared/errors.js";
import type { TransactionRequest } from "../contracts/execution-contracts.js";
import {
  ERC20_ABI,
  APPROVE_SELECTOR,
  TRANSFER_FROM_SELECTOR,
  TRANSFER_SELECTOR,
} from "./erc20-abi.js";

export interface DecodedTransaction {
  /** 4-byte selector, lowercased 0x hex. */
  selector: string;
  /** Resolved function name if known, else null. */
  functionName: string | null;
  /** True if we recognized and decoded the function. */
  known: boolean;
  /** For transfer: the on-chain recipient. For approve: the spender. Else null. */
  target: Address | null;
  /** The uint256 amount argument in base units, if applicable. */
  amountUnits: bigint | null;
  /** The token contract the call is directed at (tx.to). */
  token: Address;
  /** Raw decoded args for auditing (BigInt-safe). */
  args: Record<string, string>;
}

export class TransactionDecoder {
  decode(tx: TransactionRequest): DecodedTransaction {
    const token = getAddress(tx.to);
    const data = tx.data as `0x${string}`;
    if (!data || data === "0x" || data.length < 10) {
      // No calldata => native value transfer, not an ERC-20 op. Reported as unknown.
      return {
        selector: data && data.length >= 10 ? slice(data, 0, 4) : "0x",
        functionName: null,
        known: false,
        target: null,
        amountUnits: null,
        token,
        args: {},
      };
    }
    const selector = slice(data, 0, 4).toLowerCase();

    try {
      const decoded = decodeFunctionData({ abi: ERC20_ABI, data });
      switch (decoded.functionName) {
        case "transfer": {
          const [to, amount] = decoded.args as [Address, bigint];
          return {
            selector,
            functionName: "transfer",
            known: true,
            target: getAddress(to),
            amountUnits: amount,
            token,
            args: { to: getAddress(to), amount: amount.toString() },
          };
        }
        case "approve": {
          const [spender, amount] = decoded.args as [Address, bigint];
          return {
            selector,
            functionName: "approve",
            known: true,
            target: getAddress(spender),
            amountUnits: amount,
            token,
            args: { spender: getAddress(spender), amount: amount.toString() },
          };
        }
        case "transferFrom": {
          const [from, to, amount] = decoded.args as [Address, Address, bigint];
          return {
            selector,
            functionName: "transferFrom",
            known: true,
            target: getAddress(to),
            amountUnits: amount,
            token,
            args: { from: getAddress(from), to: getAddress(to), amount: amount.toString() },
          };
        }
        default:
          break;
      }
    } catch {
      // Not decodable with the ERC-20 ABI — fall through to unknown.
    }
    return { selector, functionName: null, known: false, target: null, amountUnits: null, token, args: {} };
  }

  /** Helper used by tests/validators to identify the well-known selectors. */
  static isKnownSelector(selector: string): boolean {
    const s = selector.toLowerCase();
    return s === TRANSFER_SELECTOR || s === APPROVE_SELECTOR || s === TRANSFER_FROM_SELECTOR;
  }
}
