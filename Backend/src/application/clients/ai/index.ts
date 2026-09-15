/**
 * AI client barrel — Phase 7.
 *
 * Authenticated consume-only adapter over the existing Orvex/ML gateway, plus the
 * deterministic intake/binding/staleness validators. Nothing here grants authority; the
 * AI remains advisory intelligence.
 */
export { AiServiceClient } from "./ai.client.js";
export type { AiClientOptions } from "./ai.client.js";
export type {
  AiProvider,
  AiResult,
  AiEnvelope,
  AiEnvelopeStatus,
  CreateIntentRequest,
  AnalyzeProposalRequest,
} from "./types.js";
export {
  validateIntentIntake,
  validateProposalIntake,
  validateAssessmentBinding,
  materialInputsOf,
  isAssessmentStale,
  assertAssessmentCurrent,
} from "./intake.js";
export type {
  IntentBinding,
  ProposalBinding,
  AssessmentBinding,
  MaterialInputs,
} from "./intake.js";
