/**
 * Client-side helpers that turn a raw ML SecurityAssessment into the firewall UI model:
 * a set of check rows and an overall decision. Pure presentation of the REAL scores —
 * no logic that overrides Core; this only visualizes what the model returned.
 */
import type { SecurityAssessment } from "./ml-client";

export type Verdict = "pass" | "warn" | "fail" | "muted";
export type Decision = "allow" | "review" | "block";

export interface CheckRow {
  label: string;
  value: string;
  verdict: Verdict;
}

function pct(n: number | null | undefined): number {
  if (n == null) return 0;
  return Math.max(0, Math.min(100, Math.round(n * 100)));
}

function levelVerdict(level?: string): Verdict {
  switch ((level ?? "").toUpperCase()) {
    case "LOW":
    case "HIGH": // reputation HIGH is good
      return "pass";
    case "MEDIUM":
    case "INSUFFICIENT_HISTORY":
    case "INSUFFICIENT_EVIDENCE":
    case "UNAVAILABLE":
      return "warn";
    case "CRITICAL":
      return "fail";
    default:
      return "muted";
  }
}

export function toChecks(a: SecurityAssessment): CheckRow[] {
  const iv = a.intent_verification ?? {};
  const th = a.threat_assessment ?? {};
  const rep = a.reputation_assessment ?? {};
  const an = a.anomaly_assessment ?? {};
  const rk = a.risk_assessment ?? {};

  return [
    {
      label: "Intent alignment",
      value: `${(iv.status ?? "—").toString()} · ${pct(iv.score)}%`,
      verdict: iv.status === "PASS" ? "pass" : iv.status === "FAIL" ? "fail" : "warn",
    },
    {
      label: "Threat signals",
      value: th.detected ? `DETECTED · ${th.severity ?? "?"}` : "NONE",
      verdict: th.detected ? (th.severity === "HIGH" || th.severity === "CRITICAL" ? "fail" : "warn") : "pass",
    },
    {
      label: "Recipient reputation",
      value: (rep.level ?? "—").toString(),
      verdict: levelVerdict(rep.level),
    },
    {
      label: "Anomaly",
      value: (an.level ?? "—").toString(),
      verdict: levelVerdict(an.level),
    },
    {
      label: "Risk score",
      value: `${(rk.level ?? "—").toString()} · ${pct(rk.score)}%`,
      verdict: levelVerdict(rk.level),
    },
  ];
}

/** Map the model's advisory recommended_handling to an ALLOW/REVIEW/BLOCK badge. */
export function toDecision(a: SecurityAssessment): { decision: Decision; label: string; reason: string } {
  const handling = (a.overall_assessment?.recommended_handling ?? "").toUpperCase();
  const threat = a.threat_assessment;
  if (handling === "DENY_RECOMMENDED" || threat?.severity === "HIGH" || threat?.severity === "CRITICAL") {
    return { decision: "block", label: "BLOCK", reason: a.overall_assessment?.summary ?? "Unsafe at the trust boundary." };
  }
  if (handling === "PROCEED_CANDIDATE") {
    return { decision: "allow", label: "ALLOW", reason: a.overall_assessment?.summary ?? "Within authority and safety constraints." };
  }
  return { decision: "review", label: "REVIEW", reason: a.overall_assessment?.summary ?? "Human decision required before execution." };
}

export function riskPercent(a: SecurityAssessment): number {
  return pct(a.risk_assessment?.score);
}
