/**
 * x402 PaymentRequirement parsing + validation.
 *
 * An x402 "402 Payment Required" response carries payment requirements from an external
 * service. This is UNTRUSTED external input (BLOCKCHAIN_ARCHITECTURE §12): it must be
 * strictly parsed and validated (network allow-listed, asset = USDC, amount exact,
 * recipient present) before it is ever mapped to an execution context. It can NEVER
 * bypass Core authorization — the parsed requirement is only a *candidate* that Core must
 * still authorize.
 */
import { z } from "zod";
import { getAddress, isAddress } from "viem";
import { ExecutionError } from "../shared/errors.js";

/** The subset of x402 fields we support in V1 (USDC on Base Sepolia, EIP-3009 style). */
export const X402Requirement = z
  .object({
    scheme: z.string(),
    network: z.string(),
    /** Base-unit amount as a decimal STRING of USDC (human), validated exactly downstream. */
    maxAmountRequired: z.string(),
    /** Recipient (payTo) address. */
    payTo: z.string(),
    /** The token/asset contract. */
    asset: z.string(),
    resource: z.string().nullish(),
    description: z.string().nullish(),
    mimeType: z.string().nullish(),
    maxTimeoutSeconds: z.number().int().nullish(),
    extra: z.record(z.string(), z.unknown()).nullish(),
  })
  .strip();
export type X402Requirement = z.infer<typeof X402Requirement>;

export interface ParsedX402 {
  scheme: string;
  network: string;
  amount: string;
  payTo: string;
  asset: string;
  resource: string | null;
}

export interface X402ParseOptions {
  /** Networks this deployment is willing to settle on (e.g. ["base-sepolia"]). */
  allowedNetworks: string[];
  /** The USDC token address expected for the network. */
  expectedUsdc: string;
}

export class PaymentRequirementParser {
  parse(raw: unknown, opts: X402ParseOptions): ParsedX402 {
    const result = X402Requirement.safeParse(raw);
    if (!result.success) {
      throw ExecutionError.of("VALIDATION_FAILED", "Malformed x402 payment requirement.", {
        issues: result.error.issues.map((i) => i.path.join(".")),
      });
    }
    const r = result.data;

    if (r.scheme !== "exact") {
      throw ExecutionError.of("UNSUPPORTED", "Only the x402 'exact' scheme is supported in V1.", { scheme: r.scheme });
    }
    if (!opts.allowedNetworks.includes(r.network)) {
      throw ExecutionError.of("VALIDATION_FAILED", "x402 network is not allow-listed.", {
        network: r.network,
        allowed: opts.allowedNetworks,
      });
    }
    if (!isAddress(r.payTo)) {
      throw ExecutionError.of("VALIDATION_FAILED", "x402 payTo is not a valid address.", { payTo: r.payTo });
    }
    if (!isAddress(r.asset) || getAddress(r.asset) !== getAddress(opts.expectedUsdc)) {
      throw ExecutionError.of("VALIDATION_FAILED", "x402 asset is not the expected USDC contract.", {
        asset: r.asset,
        expected: opts.expectedUsdc,
      });
    }
    if (!/^\d+(\.\d+)?$/.test(r.maxAmountRequired)) {
      throw ExecutionError.of("VALIDATION_FAILED", "x402 amount is not a valid decimal.", { amount: r.maxAmountRequired });
    }

    return {
      scheme: r.scheme,
      network: r.network,
      amount: r.maxAmountRequired,
      payTo: getAddress(r.payTo),
      asset: getAddress(r.asset),
      resource: r.resource ?? null,
    };
  }
}
