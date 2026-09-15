/**
 * Transaction Gate — Phase 9 (Tasks 9.1-9.6).
 *
 * The deterministic boundary that guarantees the CONCRETE transaction is exactly what
 * the agent proposed. It compares the ActionProposal (what the agent wanted) against the
 * normalized TransactionIntent / TransactionAnalysis (what will actually execute) and
 * binds the SimulationResult to the exact transaction it evaluated.
 *
 * Core does NOT decode calldata or talk to any chain (no viem/ethers/RPC here). The
 * Execution subsystem (Person 4) performs chain-specific decoding and returns a
 * normalized TransactionAnalysis; Core consumes that normalized result. All money is
 * compared as exact decimal strings (never float).
 *
 * Any material discrepancy is a TRANSACTION_MISMATCH: the transaction must not proceed
 * to authorization. Simulation reuse across a changed transaction is a stale simulation
 * and is rejected.
 */
import type {
  ActionProposal,
  SimulationResult,
  TransactionAnalysis,
  TransactionIntent,
} from "../shared/contracts/index.js";
import { toDecimal } from "../shared/money.js";
import { sha256Json } from "../shared/hash.js";

export type TransactionGateStatus = "MATCH" | "MISMATCH";

export interface FieldMismatch {
  field: string;
  expected: string | null;
  actual: string | null;
}

export interface TransactionGateResult {
  status: TransactionGateStatus;
  mismatches: FieldMismatch[];
}

/** Normalized recipient extraction from a proposal (address preferred, else identifier). */
function proposalRecipient(proposal: ActionProposal): string | null {
  return proposal.recipient?.address ?? proposal.recipient?.identifier ?? null;
}

function proposalNetwork(proposal: ActionProposal): string | null {
  return proposal.network ?? proposal.recipient?.network ?? null;
}

/** Exact-decimal amount equality (handles "5" == "5.00", rejects float drift). */
function amountsEqual(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  try {
    return toDecimal(a).equals(toDecimal(b));
  } catch {
    return false;
  }
}

/**
 * Normalize an approved ActionProposal into a canonical TransactionIntent (§22 / Task
 * 9.1). This is the business/authorization object, NOT raw calldata.
 */
export function normalizeToTransactionIntent(
  proposal: ActionProposal,
  transactionId: string,
): TransactionIntent {
  const network = proposalNetwork(proposal) ?? "";
  const recipient = proposalRecipient(proposal) ?? "";
  return {
    schema_version: "transaction_intent.v1",
    transaction_id: transactionId,
    proposal_id: proposal.proposal_id,
    action_type: proposal.action_type,
    network,
    asset: { symbol: proposal.amount?.currency ?? "" },
    amount: proposal.amount?.value ?? "0",
    recipient: { address: recipient, type: proposal.recipient?.type ?? undefined },
    payment_method: proposal.payment_method ?? undefined,
    constraints: {},
  };
}

/**
 * Deterministically compare the ActionProposal against the concrete TransactionAnalysis
 * returned by the Execution subsystem. Verifies recipient, amount, asset, network, and
 * (where present) contract/function/status. Returns MATCH only when every material
 * field aligns exactly; otherwise MISMATCH with the offending fields.
 *
 * `expectedNetwork` is passed explicitly because the analysis carries the actual chain;
 * the caller supplies the network the proposal/intent authorized.
 */
export function compareProposalVsTransaction(
  proposal: ActionProposal,
  analysis: TransactionAnalysis,
  context: {
    expectedNetwork: string;
    actualNetwork: string;
    /** If the proposal is a simple payment, an arbitrary contract call is a mismatch. */
    expectSimplePayment?: boolean;
  },
): TransactionGateResult {
  const mismatches: FieldMismatch[] = [];

  const expectedRecipient = proposalRecipient(proposal);
  if (expectedRecipient !== analysis.recipient) {
    mismatches.push({ field: "recipient", expected: expectedRecipient, actual: analysis.recipient });
  }

  const expectedAmount = proposal.amount?.value ?? null;
  if (!amountsEqual(expectedAmount, analysis.amount)) {
    mismatches.push({ field: "amount", expected: expectedAmount, actual: analysis.amount });
  }

  const expectedAsset = proposal.amount?.currency ?? null;
  if (expectedAsset !== analysis.asset) {
    mismatches.push({ field: "asset", expected: expectedAsset, actual: analysis.asset });
  }

  if (context.expectedNetwork !== context.actualNetwork) {
    mismatches.push({
      field: "network",
      expected: context.expectedNetwork,
      actual: context.actualNetwork,
    });
  }

  // The analysis itself may flag the decoded transaction as invalid/suspicious.
  if (analysis.status !== "VALID") {
    mismatches.push({ field: "analysis.status", expected: "VALID", actual: analysis.status });
  }

  // A simple payment must not resolve to an arbitrary non-transfer function.
  if (context.expectSimplePayment) {
    const fn = analysis.function?.name;
    if (fn && !["transfer", "transferFrom", "pay"].includes(fn)) {
      mismatches.push({ field: "function", expected: "transfer|pay", actual: fn });
    }
    if (analysis.risk_flags && analysis.risk_flags.length > 0) {
      mismatches.push({
        field: "risk_flags",
        expected: "none",
        actual: analysis.risk_flags.join(","),
      });
    }
  }

  return { status: mismatches.length === 0 ? "MATCH" : "MISMATCH", mismatches };
}

/**
 * Deterministic payload hash for a transaction candidate. A simulation is only valid for
 * the exact payload this hash represents; any material mutation changes the hash and
 * invalidates the prior simulation.
 */
export function transactionPayloadHash(input: {
  transactionId: string;
  network: string;
  recipient: string;
  amount: string;
  asset: string;
  contractAddress?: string | null;
  functionSelector?: string | null;
}): string {
  return sha256Json({
    transactionId: input.transactionId,
    network: input.network,
    recipient: input.recipient,
    amount: input.amount,
    asset: input.asset,
    contractAddress: input.contractAddress ?? null,
    functionSelector: input.functionSelector ?? null,
  });
}

export type SimulationBindingStatus = "VALID" | "STALE" | "WRONG_TRANSACTION" | "WRONG_PAYLOAD";

export interface SimulationBindingResult {
  status: SimulationBindingStatus;
  reason?: string;
}

/**
 * Verify that a SimulationResult is bound to the exact transaction/payload under
 * evaluation (Task 9.4). A simulation for transaction A can NEVER authorize transaction
 * B, and a simulation over an old payload hash is STALE.
 */
export function validateSimulationBinding(
  simulation: SimulationResult,
  expected: {
    transactionId: string;
    /** The payload hash the simulation was recorded against. */
    simulatedPayloadHash: string;
    /** The current transaction's payload hash. */
    currentPayloadHash: string;
  },
): SimulationBindingResult {
  if (simulation.transaction_id !== expected.transactionId) {
    return {
      status: "WRONG_TRANSACTION",
      reason: `Simulation is for transaction ${simulation.transaction_id}, not ${expected.transactionId}.`,
    };
  }
  if (expected.simulatedPayloadHash !== expected.currentPayloadHash) {
    return {
      status: "STALE",
      reason: "Transaction payload changed after simulation; simulation is stale.",
    };
  }
  return { status: "VALID" };
}

export type SimulationOutcome = "CONTINUE" | "DENY" | "REVIEW" | "FAIL_CLOSED";

/**
 * Map a SimulationResult status to a gate outcome (Task 9.5):
 *   PASS -> CONTINUE, REVERT -> DENY, UNEXPECTED_STATE_CHANGE -> REVIEW,
 *   INSUFFICIENT_FUNDS -> DENY, ERROR/UNSUPPORTED -> FAIL_CLOSED (deny if mandatory).
 */
export function classifySimulation(simulation: SimulationResult): SimulationOutcome {
  switch (simulation.status) {
    case "PASS":
      return "CONTINUE";
    case "REVERT":
    case "INSUFFICIENT_FUNDS":
      return "DENY";
    case "UNEXPECTED_STATE_CHANGE":
      return "REVIEW";
    case "ERROR":
    case "UNSUPPORTED":
      return "FAIL_CLOSED";
    default:
      return "FAIL_CLOSED";
  }
}
