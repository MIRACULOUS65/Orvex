/**
 * Phase 9 — Transaction Gate tests (Tasks 9.3/9.6 + critical security tests 1-4).
 *
 * Pure/in-memory. Proves the concrete transaction must match the proposal exactly and
 * that a simulation is bound to the exact transaction/payload it evaluated.
 */
import { describe, expect, it } from "vitest";
import {
  compareProposalVsTransaction,
  normalizeToTransactionIntent,
  transactionPayloadHash,
  validateSimulationBinding,
  classifySimulation,
} from "@/execution-gate/index";
import { ActionProposal, TransactionAnalysis, SimulationResult } from "@/shared/contracts/index";

function proposal(overrides: Record<string, unknown> = {}) {
  return ActionProposal.parse({
    proposal_id: "proposal_1",
    intent_id: "intent_1",
    agent_id: "agent_1",
    action_type: "PAY",
    purpose: "renew",
    amount: { value: "5.00", currency: "USDC" },
    recipient: { type: "SERVICE", identifier: "provider-a", address: "0xProviderA", network: "base-sepolia" },
    network: "base-sepolia",
    created_at: "2026-09-11T12:00:00Z",
    ...overrides,
  });
}

function analysis(overrides: Record<string, unknown> = {}) {
  return TransactionAnalysis.parse({
    schema_version: "transaction_analysis.v1",
    transaction_id: "txn_1",
    contract: { address: "0xUSDC", verified: true },
    function: { name: "transfer", selector: "0xa9059cbb" },
    decoded_arguments: {},
    state_changes_expected: [],
    recipient: "0xProviderA",
    amount: "5.00",
    asset: "USDC",
    risk_flags: [],
    status: "VALID",
    ...overrides,
  });
}

function simulation(overrides: Record<string, unknown> = {}) {
  return SimulationResult.parse({
    schema_version: "simulation_result.v1",
    transaction_id: "txn_1",
    status: "PASS",
    would_revert: false,
    expected_state_changes: [],
    unexpected_state_changes: [],
    revert_reason: null,
    simulator: { provider: "sim", version: "1" },
    simulated_at: "2026-09-11T12:00:00Z",
    ...overrides,
  });
}

const ctx = { expectedNetwork: "base-sepolia", actualNetwork: "base-sepolia", expectSimplePayment: true };

describe("Phase 9 — proposal vs transaction matching", () => {
  it("MATCH when everything aligns", () => {
    expect(compareProposalVsTransaction(proposal(), analysis(), ctx).status).toBe("MATCH");
  });

  it("CRITICAL 1: Provider A proposed, Provider B in transaction -> MISMATCH", () => {
    const res = compareProposalVsTransaction(proposal(), analysis({ recipient: "0xProviderB" }), ctx);
    expect(res.status).toBe("MISMATCH");
    expect(res.mismatches.some((m) => m.field === "recipient")).toBe(true);
  });

  it("CRITICAL 2: $5 proposed, $6 in transaction -> MISMATCH", () => {
    const res = compareProposalVsTransaction(proposal(), analysis({ amount: "6.00" }), ctx);
    expect(res.status).toBe("MISMATCH");
    expect(res.mismatches.some((m) => m.field === "amount")).toBe(true);
  });

  it("treats 5 and 5.00 as equal (exact decimal, no false mismatch)", () => {
    const res = compareProposalVsTransaction(proposal({ amount: { value: "5", currency: "USDC" } }), analysis({ amount: "5.00" }), ctx);
    expect(res.status).toBe("MATCH");
  });

  it("CRITICAL 3: base-sepolia proposed, base mainnet actual -> MISMATCH", () => {
    const res = compareProposalVsTransaction(proposal(), analysis(), {
      expectedNetwork: "base-sepolia",
      actualNetwork: "base",
    });
    expect(res.status).toBe("MISMATCH");
    expect(res.mismatches.some((m) => m.field === "network")).toBe(true);
  });

  it("wrong asset -> MISMATCH", () => {
    const res = compareProposalVsTransaction(proposal(), analysis({ asset: "DAI" }), ctx);
    expect(res.status).toBe("MISMATCH");
  });

  it("simple payment resolving to an arbitrary contract function -> MISMATCH", () => {
    const res = compareProposalVsTransaction(
      proposal(),
      analysis({ function: { name: "approveAndCall", selector: "0xdeadbeef" } }),
      ctx,
    );
    expect(res.status).toBe("MISMATCH");
    expect(res.mismatches.some((m) => m.field === "function")).toBe(true);
  });

  it("analysis status not VALID -> MISMATCH", () => {
    const res = compareProposalVsTransaction(proposal(), analysis({ status: "SUSPICIOUS" }), ctx);
    expect(res.status).toBe("MISMATCH");
  });

  it("normalizes an approved proposal into a canonical TransactionIntent", () => {
    const intent = normalizeToTransactionIntent(proposal(), "txn_1");
    expect(intent.amount).toBe("5.00");
    expect(intent.recipient.address).toBe("0xProviderA");
    expect(intent.network).toBe("base-sepolia");
  });
});

describe("Phase 9 — simulation binding + payload hash", () => {
  const baseHashInput = {
    transactionId: "txn_1",
    network: "base-sepolia",
    recipient: "0xProviderA",
    amount: "5.00",
    asset: "USDC",
  };

  it("same payload -> same hash; mutated payload -> different hash", () => {
    const h1 = transactionPayloadHash(baseHashInput);
    expect(transactionPayloadHash(baseHashInput)).toBe(h1);
    for (const mutation of [
      { recipient: "0xOther" },
      { amount: "5.01" },
      { asset: "DAI" },
      { network: "base" },
      { contractAddress: "0xNew" },
      { functionSelector: "0xdead" },
    ]) {
      expect(transactionPayloadHash({ ...baseHashInput, ...mutation })).not.toBe(h1);
    }
  });

  it("VALID binding when transaction id + payload hash match", () => {
    const h = transactionPayloadHash(baseHashInput);
    expect(validateSimulationBinding(simulation(), {
      transactionId: "txn_1",
      simulatedPayloadHash: h,
      currentPayloadHash: h,
    }).status).toBe("VALID");
  });

  it("CRITICAL 4: simulation for txn A cannot authorize txn B (WRONG_TRANSACTION)", () => {
    const h = transactionPayloadHash(baseHashInput);
    const res = validateSimulationBinding(simulation({ transaction_id: "txn_A" }), {
      transactionId: "txn_B",
      simulatedPayloadHash: h,
      currentPayloadHash: h,
    });
    expect(res.status).toBe("WRONG_TRANSACTION");
  });

  it("stale simulation when payload changed after simulation", () => {
    const simulated = transactionPayloadHash(baseHashInput);
    const current = transactionPayloadHash({ ...baseHashInput, amount: "6.00" });
    const res = validateSimulationBinding(simulation(), {
      transactionId: "txn_1",
      simulatedPayloadHash: simulated,
      currentPayloadHash: current,
    });
    expect(res.status).toBe("STALE");
  });
});

describe("Phase 9 — simulation status classification", () => {
  it("maps statuses to gate outcomes", () => {
    expect(classifySimulation(simulation({ status: "PASS" }))).toBe("CONTINUE");
    expect(classifySimulation(simulation({ status: "REVERT" }))).toBe("DENY");
    expect(classifySimulation(simulation({ status: "INSUFFICIENT_FUNDS" }))).toBe("DENY");
    expect(classifySimulation(simulation({ status: "UNEXPECTED_STATE_CHANGE" }))).toBe("REVIEW");
    expect(classifySimulation(simulation({ status: "ERROR" }))).toBe("FAIL_CLOSED");
    expect(classifySimulation(simulation({ status: "UNSUPPORTED" }))).toBe("FAIL_CLOSED");
  });
});
