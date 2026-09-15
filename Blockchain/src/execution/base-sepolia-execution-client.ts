/**
 * BaseSepoliaExecutionClient — the REAL implementation of Core's frozen ExecutionClient.
 *
 * It is a drop-in for MockExecutionClient: same 5 methods, same contract shapes. Core
 * calls it without knowing viem/RPC/wallet/signer exist. Internally it composes the
 * chain/rpc/builder/analyzer/validator/simulator/receipt pipeline (and optionally the
 * smart-account rail).
 *
 * Statefulness: Core's `verify(executionId)` / `getResult(executionId)` take only an id,
 * so the client caches per-execution state (via the ExecutionPipeline's idempotency store).
 *
 * Authorized context: Core's `execute(ExecutionRequest)` contract does not carry the
 * authorized recipient/asset/amount. Those live in Core's authorization state. The client
 * obtains them through an injected `AuthorizedContextResolver` so it can validate the
 * built transaction against what Core authorized — WITHOUT changing the Core contract or
 * trusting any AI text. If the resolver cannot supply an authorized context, execution is
 * refused (fail closed): the real client NEVER executes an unauthorized transfer.
 */
import { getAddress } from "viem";
import { ExecutionError, isExecutionError } from "../shared/errors.js";
import type { RpcProvider } from "../rpc/rpc-provider.js";
import type { ChainRegistry } from "../chains/chain-registry.js";
import { TransactionBuilder } from "../transactions/transaction-builder.js";
import { TransactionAnalyzer } from "../transactions/transaction-analyzer.js";
import { Simulator } from "../simulation/simulator.js";
import { ExecutionPipeline, type AuthorizedContext } from "./execution-pipeline.js";
import type { Submitter } from "./submitter.js";
import type { IdempotencyStore } from "./idempotency-store.js";
import type {
  AnalyzeTransactionRequest,
  ExecutionClient,
  ExecutionRequest,
  ExecutionResult,
  ReceiptVerification,
  SimulateRequest,
  SimulationResult,
  TransactionAnalysis,
} from "../contracts/execution-contracts.js";

/**
 * Supplies the authorized context (intent + expectation) for an execution/transaction id.
 * The integration layer implements this against Core's authorization state; it is the
 * ground truth the built transaction is validated against. Returns null if unknown.
 */
export interface AuthorizedContextResolver {
  resolve(ids: { executionId?: string; transactionId: string }): Promise<AuthorizedContext | null> | AuthorizedContext | null;
}

export interface BaseSepoliaExecutionClientDeps {
  rpc: RpcProvider;
  registry: ChainRegistry;
  submitter: Submitter;
  resolver: AuthorizedContextResolver;
  timeoutMs?: number;
  store?: IdempotencyStore;
}

export class BaseSepoliaExecutionClient implements ExecutionClient {
  private readonly pipeline: ExecutionPipeline;
  private readonly analyzer: TransactionAnalyzer;
  private readonly builder: TransactionBuilder;
  private readonly simulator: Simulator;

  constructor(private readonly deps: BaseSepoliaExecutionClientDeps) {
    this.pipeline = new ExecutionPipeline({
      rpc: deps.rpc,
      registry: deps.registry,
      submitter: deps.submitter,
      timeoutMs: deps.timeoutMs ?? 60_000,
      store: deps.store,
    });
    this.analyzer = new TransactionAnalyzer(deps.registry);
    this.builder = new TransactionBuilder(deps.registry);
    this.simulator = new Simulator(deps.rpc, deps.registry);
  }

  /** Analyze the transaction that WOULD be built for this authorization (decoded truth). */
  async validateTransaction(req: AnalyzeTransactionRequest): Promise<TransactionAnalysis> {
    const ctx = await this.requireContext({ transactionId: req.transactionId });
    const tx = this.builder.build(ctx.intent, { from: this.deps.submitter.sender, transactionId: req.transactionId });
    return this.analyzer.analyze(tx);
  }

  /** Deterministic simulation of the built transaction. */
  async simulate(req: SimulateRequest): Promise<SimulationResult> {
    const ctx = await this.requireContext({ transactionId: req.transactionId });
    const tx = this.builder.build(ctx.intent, { from: this.deps.submitter.sender, transactionId: req.transactionId });
    const sim = await this.simulator.simulate(tx);
    return sim.result;
  }

  /** Execute an already-authorized ExecutionRequest through the full pipeline. */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const ctx = await this.requireContext({ executionId: request.execution_id, transactionId: request.transaction_id });
    // Defense in depth: the resolver's network/chain must match the request's network.
    if (ctx.expectation.network !== request.network) {
      throw ExecutionError.of("VALIDATION_FAILED", "Authorized network does not match execution request network.", {
        authorized: ctx.expectation.network,
        request: request.network,
      });
    }
    return this.pipeline.execute(request, ctx);
  }

  async getResult(executionId: string): Promise<ExecutionResult> {
    return this.pipeline.getResult(executionId);
  }

  async verify(executionId: string): Promise<ReceiptVerification> {
    return this.pipeline.verify(executionId);
  }

  private async requireContext(ids: { executionId?: string; transactionId: string }): Promise<AuthorizedContext> {
    let ctx: AuthorizedContext | null;
    try {
      ctx = await this.deps.resolver.resolve(ids);
    } catch (cause) {
      if (isExecutionError(cause)) throw cause;
      throw ExecutionError.of("VALIDATION_FAILED", "Failed to resolve the authorized context.", ids, cause);
    }
    if (!ctx) {
      // Fail closed: no authorized context => never execute.
      throw ExecutionError.of("VALIDATION_FAILED", "No authorized context for this transaction; refusing to execute.", ids);
    }
    // Normalize the sender in the intent recipient stays as authorized; sender is ours.
    getAddress(this.deps.submitter.sender);
    return ctx;
  }
}
