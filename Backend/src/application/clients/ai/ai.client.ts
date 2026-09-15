/**
 * AI service HTTP client — Phase 7, Tasks 7.1/7.2/7.5.
 *
 * Authenticated adapter over the existing Orvex/ML gateway. Uses Node's global fetch
 * (Node 24) with a Bearer INTERNAL_SERVICE_TOKEN for service-to-service auth (Task 7.2).
 * Never trusts a response merely because it arrived: every payload is parsed against the
 * Phase 2 Zod contracts (Intent / SecurityAssessment) and a malformed response raises a
 * typed error rather than flowing downstream (Task 7.5). Schema validity is NOT
 * authorization — that is the orchestrator/policy engine's job.
 *
 * Failure behavior (Task 7.7): a network/timeout/HTTP error surfaces as AI_UNAVAILABLE
 * or PROVIDER_ERROR; callers must treat AI-unavailable as "not ALLOW" (REVIEW/DENY),
 * never silently as success.
 */
import { Intent, SecurityAssessment } from "../../../shared/contracts/index.js";
import { CoreError } from "../../../shared/errors/index.js";
import type {
  AiEnvelope,
  AiProvider,
  AiResult,
  AnalyzeProposalRequest,
  CreateIntentRequest,
} from "./types.js";

export interface AiClientOptions {
  baseUrl: string;
  serviceToken?: string;
  timeoutMs?: number;
  /** Injectable fetch for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export class AiServiceClient implements AiProvider {
  private readonly baseUrl: string;
  private readonly serviceToken?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/u, "");
    this.serviceToken = options.serviceToken;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async post<T>(path: string, body: unknown): Promise<AiEnvelope<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.serviceToken ? { authorization: `Bearer ${this.serviceToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      // Network failure / timeout: the AI is unavailable. Fail closed at the caller.
      throw CoreError.of("PROVIDER_ERROR", "AI service request failed.", {
        retryable: true,
        details: { path },
        cause: err,
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      throw CoreError.of("AUTHENTICATION_ERROR", "AI service rejected service credentials.", {
        details: { path, status: response.status },
      });
    }
    if (!response.ok) {
      throw CoreError.of("PROVIDER_ERROR", "AI service returned an error status.", {
        retryable: response.status >= 500,
        details: { path, status: response.status },
      });
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (err) {
      throw CoreError.of("PROVIDER_ERROR", "AI service returned non-JSON.", {
        details: { path },
        cause: err,
      });
    }
    return json as AiEnvelope<T>;
  }

  async createIntent(req: CreateIntentRequest): Promise<AiResult<Intent>> {
    const envelope = await this.post<unknown>("/intent/parse", {
      execution_id: req.executionId,
      agent_id: req.agentId,
      user_goal: req.userGoal,
      user_id: req.userId,
      validity_hours: req.validityHours ?? 24,
    });
    if (envelope.data === null || envelope.status === "ERROR") {
      throw CoreError.of("PROVIDER_ERROR", "AI intent parse returned no data.", {
        details: { status: envelope.status },
      });
    }
    const parsed = Intent.safeParse(envelope.data);
    if (!parsed.success) {
      throw CoreError.of("SCHEMA_ERROR", "AI Intent failed contract validation.", {
        details: { issues: parsed.error.issues.slice(0, 5) },
      });
    }
    return { status: envelope.status, data: parsed.data, requestId: envelope.request_id };
  }

  async analyzeProposal(req: AnalyzeProposalRequest): Promise<AiResult<SecurityAssessment>> {
    const envelope = await this.post<unknown>("/proposal/analyze", {
      execution_id: req.executionId,
      agent_id: req.agentId,
      intent: req.intent,
      proposal: req.proposal,
      trajectory: req.trajectory ?? [],
      evidence: req.evidence ?? [],
      recipient_context: req.recipientContext ?? null,
      historical_behavior: req.historicalBehavior ?? null,
    });
    if (envelope.data === null || envelope.status === "ERROR") {
      throw CoreError.of("PROVIDER_ERROR", "AI proposal analysis returned no data.", {
        details: { status: envelope.status },
      });
    }
    const parsed = SecurityAssessment.safeParse(envelope.data);
    if (!parsed.success) {
      throw CoreError.of("SCHEMA_ERROR", "AI SecurityAssessment failed contract validation.", {
        details: { issues: parsed.error.issues.slice(0, 5) },
      });
    }
    return { status: envelope.status, data: parsed.data, requestId: envelope.request_id };
  }
}
