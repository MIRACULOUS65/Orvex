/**
 * SentinelPay shared contracts — Phase 2 barrel export.
 *
 * The single import surface for the executable form of CONTRACTS.md. Every schema is
 * exported here alongside its inferred TypeScript type (same identifier, Zod schema +
 * `z.infer` type share the name by design).
 *
 * Two provenance families live here:
 *   - AI-boundary contracts (Intent, TrajectoryEvent, Evidence, ActionProposal,
 *     SecurityAssessment, ModelMetadata, Error) mirror Orvex/ML/schemas/*.py and are
 *     parsed leniently on the consumer side.
 *   - Core-owned contracts (Constitution, Policy, Transaction*, PolicyEvaluation,
 *     Approval*, Decision, Execution*, ReceiptVerification, AuditEvent,
 *     AttestationRecord) mirror CONTRACTS.md exactly and are emitted strictly.
 *
 * Core principle enforced structurally: advisory AI contracts carry NO authority
 * field; authorization lives only in the deterministic `Decision`.
 *
 * NOTE: `evidence.ts` re-exports the trajectory `TrustLevel` under the alias
 * `EvidenceTrustLevel`, so there is no duplicate-export clash between the two modules.
 */

// ---- Primitives --------------------------------------------------------- //
export * from "./primitives.js";

// ---- AI-boundary contracts (mirror ML Pydantic) ------------------------- //
export * from "./intent.js";
export * from "./trajectory.js";
export * from "./evidence.js";
export * from "./action-proposal.js";
export * from "./model-metadata.js";
export * from "./security-assessment.js";
export * from "./error.js";

// ---- Core-owned contracts (mirror CONTRACTS.md) ------------------------- //
export * from "./constitution.js";
export * from "./policy.js";
export * from "./policy-evaluation.js";
export * from "./transaction.js";
export * from "./approval.js";
export * from "./decision.js";
export * from "./execution.js";
export * from "./audit.js";
