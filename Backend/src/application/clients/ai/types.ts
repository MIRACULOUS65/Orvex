/**
 * AI service client types — Phase 7, Task 7.1.
 *
 * The Backend consumes the EXISTING Orvex/ML API (do not rebuild AI). These types
 * mirror the real gateway request/response shapes discovered in Orvex/ML/gateway:
 *   POST /intent/parse       -> Envelope<Intent>
 *   POST /proposal/analyze   -> Envelope<SecurityAssessment>
 *
 * The AI response envelope is:
 *   { schema_version, request_id, status, data, error, metadata }
 *
 * The `AiProvider` interface is the seam the orchestrator and tests depend on. Tests
 * inject alternative providers (e.g. a deliberately-broken always-ALLOW AI) without
 * touching production HTTP code — this is what makes the permanent Broken-AI regression
 * test possible while keeping Orvex/ML untouched.
 */
import type { Intent, SecurityAssessment } from "../../../shared/contracts/index.js";

export type AiEnvelopeStatus = "OK" | "ERROR" | "NEEDS_CLARIFICATION" | "INSUFFICIENT_EVIDENCE";

export interface AiEnvelope<T> {
  schema_version: string;
  request_id: string;
  status: AiEnvelopeStatus;
  data: T | null;
  error: unknown | null;
  metadata?: Record<string, unknown>;
}

/** Request to POST /intent/parse (matches Orvex/ML IntentParseRequest). */
export interface CreateIntentRequest {
  executionId: string;
  agentId: string;
  userGoal: string;
  userId?: string;
  validityHours?: number;
}

/** Request to POST /proposal/analyze (matches Orvex/ML ProposalAnalyzeRequest). */
export interface AnalyzeProposalRequest {
  executionId?: string;
  agentId?: string;
  intent: Record<string, unknown>;
  proposal: Record<string, unknown>;
  trajectory?: Array<Record<string, unknown>>;
  evidence?: Array<Record<string, unknown>>;
  recipientContext?: Record<string, unknown> | null;
  historicalBehavior?: Record<string, unknown> | null;
}

/** Result wrapper carrying the parsed contract object + the envelope status. */
export interface AiResult<T> {
  status: AiEnvelopeStatus;
  data: T;
  requestId: string;
}

/**
 * The AI provider seam. `AiServiceClient` is the real HTTP implementation; tests can
 * substitute a mock (including a broken always-ALLOW one) that returns the same shapes.
 */
export interface AiProvider {
  createIntent(req: CreateIntentRequest): Promise<AiResult<Intent>>;
  analyzeProposal(req: AnalyzeProposalRequest): Promise<AiResult<SecurityAssessment>>;
}
