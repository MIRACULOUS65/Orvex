/**
 * ExecutionPipeline — the vertical slice that turns an authorized ExecutionRequest into an
 * on-chain transaction and an independently-verified result.
 *
 * Order is a HARD security sequence (BLOCKCHAIN_ARCHITECTURE §8, invariants 4-8):
 *   1. resolve chain + assert chain match (never wrong chain)
 *   2. build the concrete transaction from the authorized intent
 *   3. analyze + validate the actual bytes vs the authorized expectation (never trust NL)
 *   4. simulate (real EVM); block on non-PASS
 *   5. assertFresh: the exact simulated payload is the executed payload (no stale sim)
 *   6. idempotency: never broadcast twice for the same logical key
 *   7. submit; on submit uncertainty => UNKNOWN (never blind-retry)
 *   8. fetch receipt; parse ACTUAL effects; verify authorized-vs-actual
 *
 * The pipeline NEVER commits money — it reports an ExecutionResult + ReceiptVerification
 * back across the boundary; Core owns the financial commit.
 */
import type { Hex } from "viem";
import { ExecutionError, isExecutionError } from "../shared/errors.js";
import type { RpcProvider } from "../rpc/rpc-provider.js";
import type { ChainRegistry } from "../chains/chain-registry.js";
import { TransactionBuilder } from "../transactions/transaction-builder.js";
import { TransactionAnalyzer } from "../transactions/transaction-analyzer.js";
import { TransactionValidator, type AuthorizedExpectation } from "../transactions/transaction-validator.js";
import { Simulator } from "../simulation/simulator.js";
import { ReceiptClient } from "../receipts/receipt-client.js";
import { ReceiptParser } from "../receipts/receipt-parser.js";
import { ReceiptVerifier, type AuthorizedReceipt } from "../receipts/receipt-verifier.js";
import type { Submitter } from "./submitter.js";
import { InMemoryIdempotencyStore, type IdempotencyStore } from "./idempotency-store.js";
import type {
  ExecutionRequest,
  ExecutionResult,
  ReceiptVerification,
  TransactionIntent,
} from "../contracts/execution-contracts.js";

/**
 * The authorized context that accompanies an ExecutionRequest. Core knows the intent +
 * the authorized recipient/asset/amount; the pipeline receives them to validate against.
 * (This is passed alongside the ExecutionRequest, not derived from AI text.)
 */
export interface AuthorizedContext {
  intent: TransactionIntent;
  expectation: AuthorizedExpectation;
}

export interface PipelineDeps {
  rpc: RpcProvider;
  registry: ChainRegistry;
  submitter: Submitter;
  timeoutMs: number;
  store?: IdempotencyStore;
}

export class ExecutionPipeline {
  private readonly builder: TransactionBuilder;
  private readonly analyzer: TransactionAnalyzer;
  private readonly validator: TransactionValidator;
  private readonly simulator: Simulator;
  private readonly receiptClient: ReceiptClient;
  private readonly parser = new ReceiptParser();
  private readonly verifier = new ReceiptVerifier();
  private readonly store: IdempotencyStore;

  constructor(private readonly deps: PipelineDeps) {
    this.builder = new TransactionBuilder(deps.registry);
    this.analyzer = new TransactionAnalyzer(deps.registry);
    this.validator = new TransactionValidator(deps.registry);
    this.simulator = new Simulator(deps.rpc, deps.registry);
    this.receiptClient = new ReceiptClient(deps.rpc);
    this.store = deps.store ?? new InMemoryIdempotencyStore();
  }

  /**
   * Execute an authorized request. Idempotent per `idempotency_key`.
   */
  async execute(request: ExecutionRequest, ctx: AuthorizedContext): Promise<ExecutionResult> {
    // 6 (early). Idempotency: a prior execution for this key returns its recorded result.
    const prior = this.store.byKey(request.idempotency_key);
    if (prior) return prior.result;

    const chain = this.deps.registry.getByNetwork(request.network);

    // 1. Chain match (configured == RPC == request). Wrong chain never executes.
    await this.deps.rpc.assertChainForRequest(chain.chainId);

    // 2. Build the concrete transaction from the AUTHORIZED intent (not AI prose).
    const tx = this.builder.build(ctx.intent, { from: this.deps.submitter.sender, transactionId: request.transaction_id });

    // 3. Analyze + validate actual bytes vs authorized expectation.
    const analysis = this.analyzer.analyze(tx);
    if (analysis.status === "INVALID") {
      throw ExecutionError.of("VALIDATION_FAILED", "Transaction analysis is INVALID.", {
        risk_flags: analysis.risk_flags,
      });
    }
    this.validator.assertValid(tx, ctx.expectation);

    // 4. Simulate (real EVM). 5. Freshness/pass gate.
    const sim = await this.simulator.simulate(tx);
    Simulator.assertFresh(sim, tx);

    // 7. Submit. Record BEFORE awaiting the receipt so a crash mid-flight is reconcilable.
    let txHash: Hex;
    try {
      txHash = await this.deps.submitter.submit(tx);
    } catch (cause) {
      // Submission uncertainty is UNKNOWN, never a silent failure and never a blind retry.
      const result = this.mkResult(request, "UNKNOWN", null);
      this.store.put({ executionId: request.execution_id, idempotencyKey: request.idempotency_key, result, authorized: ctx.expectation });
      if (isExecutionError(cause) && cause.code === "SUBMISSION_FAILED") {
        // Deterministic pre-broadcast failures (e.g. wrong signer) are FAILED, not UNKNOWN.
        const failed = this.mkResult(request, "FAILED", null);
        this.store.update(request.execution_id, { result: failed });
        return failed;
      }
      return result;
    }

    const submitted = this.mkResult(request, "PENDING", txHash);
    this.store.put({ executionId: request.execution_id, idempotencyKey: request.idempotency_key, result: submitted, authorized: ctx.expectation });

    // 8. Await receipt. No receipt within timeout => UNKNOWN (reconcile later, no retry).
    const raw = await this.receiptClient.waitForReceipt(txHash, this.deps.timeoutMs);
    if (!raw) {
      const unknown = this.mkResult(request, "UNKNOWN", txHash);
      this.store.update(request.execution_id, { result: unknown });
      return unknown;
    }

    const parsed = this.parser.parse(raw);
    const status: ExecutionResult["status"] = parsed.success ? "CONFIRMED" : "FAILED";
    const result = this.mkResult(request, status, txHash);
    this.store.update(request.execution_id, { result });
    return result;
  }

  /** getResult — answer from the recorded execution (used by Core reconciliation). */
  async getResult(executionId: string): Promise<ExecutionResult> {
    const rec = this.store.byExecutionId(executionId);
    if (!rec) {
      throw ExecutionError.of("UNKNOWN", "No execution record for id.", { executionId });
    }
    return rec.result;
  }

  /**
   * verify — independent AUTHORIZED-vs-ACTUAL check for a recorded execution. Re-fetches
   * the receipt and compares. Never fabricates success.
   */
  async verify(executionId: string): Promise<ReceiptVerification> {
    const rec = this.store.byExecutionId(executionId);
    if (!rec) {
      throw ExecutionError.of("UNKNOWN", "No execution record for id.", { executionId });
    }
    const txHash = rec.result.transaction_hash as Hex | null | undefined;
    if (!txHash) {
      throw ExecutionError.of("VERIFICATION_FAILED", "No transaction hash to verify.", { executionId });
    }
    const expectation = rec.authorized as AuthorizedExpectation | undefined;
    if (!expectation) {
      throw ExecutionError.of("VERIFICATION_FAILED", "No authorized context to verify against.", { executionId });
    }
    const raw = await this.receiptClient.getReceipt(txHash);
    if (!raw) {
      throw ExecutionError.of("UNKNOWN", "Receipt not available for verification.", { executionId });
    }
    const parsed = this.parser.parse(raw);
    const usdc = this.deps.registry.usdc(expectation.network);
    const authorized: AuthorizedReceipt = {
      recipient: expectation.recipient,
      asset: expectation.asset,
      amount: expectation.amount,
      network: expectation.network,
      tokenAddress: usdc.address ?? "",
      decimals: usdc.decimals,
    };
    const verification = this.verifier.verify({
      executionId,
      authorized,
      parsed,
      actualNetwork: rec.result.chain,
    });
    this.store.update(executionId, { verification });
    return verification;
  }

  private mkResult(request: ExecutionRequest, status: ExecutionResult["status"], txHash: Hex | null): ExecutionResult {
    const nowIso = new Date().toISOString();
    return {
      schema_version: "execution_result.v1",
      execution_id: request.execution_id,
      status,
      transaction_hash: txHash,
      chain: request.network,
      submitted_at: txHash ? nowIso : null,
      confirmed_at: status === "CONFIRMED" ? nowIso : null,
      receipt_reference: null,
      idempotency_key: request.idempotency_key,
    };
  }
}
