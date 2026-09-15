/**
 * Public API of @sentinelpay/blockchain.
 *
 * Core wires in the ExecutionClient produced by the integration factory; everything else
 * is internal. We export the small public surface described in BLOCKCHAIN_TECH_STACK §14.
 */
export type {
  ExecutionClient,
  ExecutionRequest,
  ExecutionResult,
  ReceiptVerification,
  SimulationResult,
  TransactionAnalysis,
  TransactionRequest,
  AnalyzeTransactionRequest,
  SimulateRequest,
} from "./contracts/execution-contracts.js";

export { ChainRegistry } from "./chains/chain-registry.js";
export { RpcProvider } from "./rpc/rpc-provider.js";
export { ExecutionError, isExecutionError } from "./shared/errors.js";
export { loadConfig, hasSigner, getSignerKey } from "./config/config.js";
export type { BlockchainConfig, ExecutionMode } from "./config/config.js";

export { TransactionBuilder } from "./transactions/transaction-builder.js";
export { TransactionAnalyzer } from "./transactions/transaction-analyzer.js";
export { TransactionValidator } from "./transactions/transaction-validator.js";
export { Simulator } from "./simulation/simulator.js";
export { ReceiptVerifier } from "./receipts/receipt-verifier.js";
export { ExecutionPipeline } from "./execution/execution-pipeline.js";
export { Submitter, createKeySigner } from "./execution/submitter.js";
export { SmartAccountAdapter } from "./smart-account/smart-account-adapter.js";
export { X402Adapter, FacilitatorClient, SettlementVerifier } from "./x402/x402-adapter.js";
export { AttestationAdapter, buildCommitment } from "./attestation/attestation-adapter.js";
export { BaseSepoliaExecutionClient } from "./execution/base-sepolia-execution-client.js";
export type { AuthorizedContextResolver } from "./execution/base-sepolia-execution-client.js";
export type { AuthorizedContext } from "./execution/execution-pipeline.js";
export { AuthorizedContextRegistry } from "./integration/authorized-context-registry.js";
export { buildBaseSepoliaExecutionClient } from "./integration/factory.js";
export type { BuildExecutionClientResult } from "./integration/factory.js";
