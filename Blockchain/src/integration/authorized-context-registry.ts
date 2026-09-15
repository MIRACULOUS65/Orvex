/**
 * In-memory AuthorizedContextRegistry — the bridge between Core's authorization state and
 * the execution client's need to validate the built transaction.
 *
 * Core (at FinalRevalidation time, when it mints the ExecutionRequest) registers the
 * authorized context (recipient/asset/amount/network) keyed by transaction_id (and
 * execution_id). The BaseSepoliaExecutionClient resolves it back at execute/validate time.
 *
 * This carries NO signing material — only the authorized transfer parameters Core already
 * knows. It is the execution-boundary's copy of "what Core authorized".
 */
import type { AuthorizedContext } from "../execution/execution-pipeline.js";
import type { AuthorizedContextResolver } from "../execution/base-sepolia-execution-client.js";

export class AuthorizedContextRegistry implements AuthorizedContextResolver {
  private readonly byTransaction = new Map<string, AuthorizedContext>();
  private readonly byExecution = new Map<string, string>(); // executionId -> transactionId

  /** Core registers the authorized context when it authorizes an execution. */
  register(params: { transactionId: string; executionId?: string; context: AuthorizedContext }): void {
    this.byTransaction.set(params.transactionId, params.context);
    if (params.executionId) this.byExecution.set(params.executionId, params.transactionId);
  }

  resolve(ids: { executionId?: string; transactionId: string }): AuthorizedContext | null {
    if (ids.transactionId && this.byTransaction.has(ids.transactionId)) {
      return this.byTransaction.get(ids.transactionId) ?? null;
    }
    if (ids.executionId) {
      const txId = this.byExecution.get(ids.executionId);
      if (txId) return this.byTransaction.get(txId) ?? null;
    }
    return null;
  }
}
