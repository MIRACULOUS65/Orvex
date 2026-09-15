/**
 * TransactionValidator — compares the ACTUAL decoded transaction against the AUTHORIZED
 * expectation (what Core said may execute). This is the hard security gate before any
 * simulation/execution.
 *
 * Any divergence (chain / recipient / amount / asset / function) is a VALIDATION_FAILED.
 * The natural-language proposal is irrelevant here; only the bytes and the authorized
 * expectation matter.
 */
import { getAddress, isAddress } from "viem";
import { ExecutionError } from "../shared/errors.js";
import { toBaseUnits } from "../shared/money.js";
import type { ChainRegistry } from "../chains/chain-registry.js";
import type { TransactionRequest } from "../contracts/execution-contracts.js";
import { TransactionDecoder } from "./transaction-decoder.js";

/** What Core authorized — the ground truth to validate the built transaction against. */
export interface AuthorizedExpectation {
  network: string;
  chainId: number;
  recipient: string;
  asset: string;
  /** Decimal string, exact. */
  amount: string;
  /** The only function permitted for a V1 USDC payment. */
  allowedFunction: "transfer";
}

export interface ValidationResult {
  ok: boolean;
  discrepancies: string[];
}

export class TransactionValidator {
  private readonly decoder = new TransactionDecoder();

  constructor(private readonly registry: ChainRegistry) {}

  /** Non-throwing check that returns all discrepancies. */
  check(tx: TransactionRequest, authorized: AuthorizedExpectation): ValidationResult {
    const discrepancies: string[] = [];

    // 1. Chain.
    if (tx.chain.id !== authorized.chainId) discrepancies.push("chain");
    if (tx.chain.name !== authorized.network) discrepancies.push("network");

    // 2. Asset must be USDC and match the token contract for the network.
    const usdc = this.safeUsdc(authorized.network);
    if (tx.asset.symbol !== authorized.asset) discrepancies.push("asset_symbol");
    if (usdc?.address && tx.to && isAddress(tx.to)) {
      if (getAddress(tx.to) !== getAddress(usdc.address)) discrepancies.push("token_contract");
    } else if (!usdc?.address) {
      discrepancies.push("token_unknown");
    }

    // 3. Decode and check the real function + recipient + amount.
    const decoded = this.decoder.decode(tx);
    if (!decoded.known) {
      discrepancies.push("unknown_function");
    } else if (decoded.functionName !== authorized.allowedFunction) {
      // e.g. approve / transferFrom where a plain transfer was authorized.
      discrepancies.push("unexpected_function");
    } else {
      // recipient
      if (!decoded.target || !isAddress(authorized.recipient)) {
        discrepancies.push("recipient");
      } else if (getAddress(decoded.target) !== getAddress(authorized.recipient)) {
        discrepancies.push("recipient");
      }
      // amount — exact base-unit comparison.
      const decimals = usdc?.decimals ?? 6;
      const authorizedUnits = toBaseUnits(authorized.amount, decimals);
      if (decoded.amountUnits === null || decoded.amountUnits !== authorizedUnits) {
        discrepancies.push("amount");
      }
    }

    // 4. No native value on a token transfer.
    if (tx.value !== "0") discrepancies.push("native_value");

    return { ok: discrepancies.length === 0, discrepancies };
  }

  /** Throwing variant used on the execution path. */
  assertValid(tx: TransactionRequest, authorized: AuthorizedExpectation): void {
    const res = this.check(tx, authorized);
    if (!res.ok) {
      throw ExecutionError.of("VALIDATION_FAILED", "Transaction does not match the authorized expectation.", {
        discrepancies: res.discrepancies,
      });
    }
  }

  private safeUsdc(network: string) {
    try {
      return this.registry.usdc(network);
    } catch {
      return null;
    }
  }
}
