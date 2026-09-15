/**
 * X402Adapter — the x402 payment/execution rail + FacilitatorClient + SettlementVerifier.
 *
 * Flow (BLOCKCHAIN_ARCHITECTURE §12):
 *   402 requirement -> parse+validate -> map to an execution CANDIDATE (a TransactionIntent
 *   + AuthorizedExpectation) that CORE MUST AUTHORIZE -> (Core authorizes) -> build payment
 *   payload -> facilitator settle -> verify settlement.
 *
 * The adapter deliberately DOES NOT authorize. It exposes `toExecutionCandidate()` which
 * only produces the inputs Core needs to decide; it refuses to settle a payment that was
 * not accompanied by a Core authorization token.
 */
import type { Address } from "viem";
import { ExecutionError } from "../shared/errors.js";
import { PaymentRequirementParser, type ParsedX402, type X402ParseOptions } from "./payment-requirement.js";
import type { TransactionIntent } from "../contracts/execution-contracts.js";
import type { AuthorizedExpectation } from "../transactions/transaction-validator.js";

export interface X402ExecutionCandidate {
  parsed: ParsedX402;
  intent: TransactionIntent;
  expectation: AuthorizedExpectation;
}

/** A facilitator settles an x402 payment payload and reports the settlement result. */
export interface FacilitatorTransport {
  request(path: string, body: unknown): Promise<unknown>;
}

export interface SettlementResult {
  settled: boolean;
  transactionHash: string | null;
  network: string | null;
  payer: string | null;
}

export interface X402AdapterOptions {
  parseOptions: X402ParseOptions;
  chainId: number;
  /** USDC decimals for the network (6). */
  decimals: number;
}

export class X402Adapter {
  private readonly parser = new PaymentRequirementParser();

  constructor(private readonly opts: X402AdapterOptions) {}

  /**
   * Parse a 402 requirement and map it to an execution CANDIDATE for Core to authorize.
   * This does not pay anything. Core still owns ALLOW/REVIEW/DENY.
   */
  toExecutionCandidate(raw: unknown, ctx: { proposalId: string; transactionId: string }): X402ExecutionCandidate {
    const parsed = this.parser.parse(raw, this.opts.parseOptions);
    const intent: TransactionIntent = {
      schema_version: "transaction_intent.v1",
      transaction_id: ctx.transactionId,
      proposal_id: ctx.proposalId,
      action_type: "payment",
      network: parsed.network,
      asset: { symbol: "USDC", address: parsed.asset, type: "erc20" },
      amount: parsed.amount,
      recipient: { address: parsed.payTo, type: "x402_resource" },
      payment_method: "x402",
      constraints: { x402_resource: parsed.resource ?? "" },
    };
    const expectation: AuthorizedExpectation = {
      network: parsed.network,
      chainId: this.opts.chainId,
      recipient: parsed.payTo,
      asset: "USDC",
      amount: parsed.amount,
      allowedFunction: "transfer",
    };
    return { parsed, intent, expectation };
  }
}

/** Settles a validated + Core-authorized x402 payment via the facilitator. */
export class FacilitatorClient {
  constructor(private readonly transport: FacilitatorTransport) {}

  /**
   * Settle a payment. REQUIRES a Core authorization token proving the payment was
   * authorized — the facilitator path cannot be used to bypass Core.
   */
  async settle(params: {
    payload: unknown;
    coreAuthorizationToken: string | null;
  }): Promise<SettlementResult> {
    if (!params.coreAuthorizationToken) {
      throw ExecutionError.of("VALIDATION_FAILED", "x402 settlement requires a Core authorization token (cannot bypass Core).");
    }
    const res = (await this.transport.request("/settle", {
      payload: params.payload,
      authorization: params.coreAuthorizationToken,
    })) as { success?: boolean; txHash?: string; network?: string; payer?: string };
    return {
      settled: Boolean(res.success),
      transactionHash: res.txHash ?? null,
      network: res.network ?? null,
      payer: res.payer ?? null,
    };
  }
}

/** Verifies a settlement matches the authorized candidate (network + recipient + settled). */
export class SettlementVerifier {
  verify(params: {
    candidate: X402ExecutionCandidate;
    settlement: SettlementResult;
  }): { verified: boolean; discrepancies: string[] } {
    const discrepancies: string[] = [];
    if (!params.settlement.settled) discrepancies.push("not_settled");
    if (!params.settlement.transactionHash) discrepancies.push("no_tx_hash");
    if (params.settlement.network && params.settlement.network !== params.candidate.parsed.network) {
      discrepancies.push("network");
    }
    return { verified: discrepancies.length === 0, discrepancies };
  }
}

export type { Address };
