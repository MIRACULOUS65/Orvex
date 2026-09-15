/**
 * Shared test fixtures for the execution pipeline (offline). Builds an ExecutionRequest +
 * AuthorizedContext for a USDC transfer on a given network.
 */
import type { ExecutionRequest } from "../../src/contracts/execution-contracts.js";
import type { AuthorizedContext } from "../../src/execution/execution-pipeline.js";

export const FROM = "0x1111111111111111111111111111111111111111" as const;
export const RECIPIENT = "0x2222222222222222222222222222222222222222" as const;
export const OTHER = "0x3333333333333333333333333333333333333333" as const;
export const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

export function makeExecutionRequest(o: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    schema_version: "execution_request.v1",
    execution_id: "exec_1",
    decision_id: "dec_1",
    transaction_id: "tx_1",
    executor: { type: "smart_account", account: FROM },
    payment_method: "usdc",
    network: "base-sepolia",
    idempotency_key: "idem_1",
    authorization_context_hash: "0xauth",
    created_at: new Date().toISOString(),
    ...o,
  };
}

export function makeAuthorizedContext(o: {
  amount?: string;
  recipient?: string;
  network?: string;
  chainId?: number;
} = {}): AuthorizedContext {
  const amount = o.amount ?? "5";
  const recipient = o.recipient ?? RECIPIENT;
  const network = o.network ?? "base-sepolia";
  const chainId = o.chainId ?? 84532;
  return {
    intent: {
      schema_version: "transaction_intent.v1",
      transaction_id: "tx_1",
      proposal_id: "p_1",
      action_type: "payment",
      network,
      asset: { symbol: "USDC", address: USDC, type: "erc20" },
      amount,
      recipient: { address: recipient },
      payment_method: "usdc",
      constraints: {},
    },
    expectation: {
      network,
      chainId,
      recipient,
      asset: "USDC",
      amount,
      allowedFunction: "transfer",
    },
  };
}
