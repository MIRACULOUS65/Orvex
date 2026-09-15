/**
 * Server-side client for the real ML gateway (FastAPI). Used by the Next API routes.
 * Never called from the browser directly. Returns the raw SecurityAssessment data so
 * the firewall UI can render real scores (risk/threat/reputation/anomaly).
 */
import { ORVEX } from "./orvex-config";

interface Envelope<T> {
  request_id: string;
  status: string;
  data: T;
  metadata?: { latency_ms?: number };
}

async function mlPost<T>(path: string, body: unknown, timeoutMs = 90_000): Promise<Envelope<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${ORVEX.mlBaseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ML ${path} -> ${res.status} ${text.slice(0, 300)}`);
    }
    return (await res.json()) as Envelope<T>;
  } finally {
    clearTimeout(timer);
  }
}

export interface IntentResult {
  status: string;
  data: Record<string, unknown>;
}

export async function parseIntent(userGoal: string): Promise<IntentResult> {
  const env = await mlPost<Record<string, unknown>>("/intent/parse", {
    execution_id: `demo_${Date.now()}`,
    agent_id: "orvex-demo-agent",
    user_goal: userGoal,
    validity_hours: 24,
  });
  return { status: env.status, data: env.data };
}

export interface SecurityAssessment {
  assessment_id?: string;
  intent_verification?: { status?: string; score?: number; confidence?: number };
  threat_assessment?: { detected?: boolean; severity?: string | null; confidence?: number; recommended_handling?: string };
  reputation_assessment?: { level?: string; confidence?: number; data_quality?: string };
  anomaly_assessment?: { level?: string; confidence?: number };
  risk_assessment?: { level?: string; score?: number | null; confidence?: number; drivers?: string[]; dimensions?: Record<string, number> };
  overall_assessment?: { status?: string; confidence?: number; recommended_handling?: string; summary?: string };
  explanation?: string;
}

export async function analyzeProposal(params: {
  intent: Record<string, unknown>;
  proposal: Record<string, unknown>;
  evidence?: unknown[];
  trajectory?: unknown[];
  recipientContext?: Record<string, unknown> | null;
}): Promise<SecurityAssessment> {
  const env = await mlPost<SecurityAssessment>("/security/analyze", {
    execution_id: `demo_${Date.now()}`,
    agent_id: "orvex-demo-agent",
    intent: params.intent,
    proposal: params.proposal,
    trajectory: params.trajectory ?? [],
    evidence: params.evidence ?? [],
    recipient_context: params.recipientContext ?? null,
    historical_behavior: null,
  });
  return env.data;
}
