/**
 * SecurityAssessment contracts — Phase 2, Task 2.1 / 2.5.
 *
 * Mirrors CONTRACTS.md §15-21 and Orvex/ML/schemas/security_assessment.py. This is
 * the primary AI/ML output to Core. It is ADVISORY intelligence, NEVER authorization
 * (CONTRACTS.md §21). Core principle: "AI may recommend. Deterministic systems
 * authorize."
 *
 * AUTHORITY BOUNDARY (Task 2.5): there is deliberately NO field named or semantically
 * equal to `authorized`, `execute`, `allow`, or `sign`. The only decision-shaped field
 * is `recommended_handling`, whose vocabulary is limited to advisory verbs
 * (PROCEED_CANDIDATE / MONITOR / REVIEW / DENY_RECOMMENDED). Core is free to disregard
 * it. The authority-boundary tests assert these fields never appear even after parsing
 * (`.strip()` drops unknown keys so an attacker cannot smuggle `authorized:true`
 * through into the parsed object).
 *
 * NOTE ON FORWARD-COMPAT: unlike the other AI-boundary contracts, these advisory
 * objects are parsed with `.strip()` (Zod's default object behavior) rather than
 * `.passthrough()`. Dropping unknown keys is the safer choice here: it guarantees a
 * parsed SecurityAssessment can never carry a smuggled authority field, satisfying the
 * hard invariant in Task 2.5 over generic forward-compat leniency.
 */
import { z } from "zod";
import { idString, isoTimestamp, unitInterval } from "./primitives.js";
import { ModelMetadata } from "./model-metadata.js";

// ---- Sub-assessments ---------------------------------------------------- //

export const IntentVerificationResult = z.object({
  schema_version: z
    .literal("intent_verification.v1")
    .default("intent_verification.v1"),
  status: z.enum(["PASS", "FAIL", "UNCERTAIN", "INSUFFICIENT_EVIDENCE"]),
  intent_match: z.boolean(),
  score: z.number(),
  dimensions: z.record(z.string(), z.number()).default({}),
  violations: z.array(z.string()).default([]),
  reasons: z.array(z.string()).default([]),
  evidence_ids: z.array(z.string()).default([]),
  confidence: unitInterval.default(0),
});
export type IntentVerificationResult = z.infer<typeof IntentVerificationResult>;

export const ThreatAssessment = z.object({
  schema_version: z.literal("threat_assessment.v1").default("threat_assessment.v1"),
  detected: z.boolean(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).nullish(),
  categories: z.array(z.string()).default([]),
  confidence: unitInterval.default(0),
  evidence_ids: z.array(z.string()).default([]),
  trajectory_event_ids: z.array(z.string()).default([]),
  explanation: z.string().default(""),
  // Advisory only. NOT authorization.
  recommended_handling: z
    .enum(["MONITOR", "REVIEW", "DENY_RECOMMENDED"])
    .default("MONITOR"),
});
export type ThreatAssessment = z.infer<typeof ThreatAssessment>;

export const ReputationAssessment = z.object({
  schema_version: z
    .literal("reputation_assessment.v1")
    .default("reputation_assessment.v1"),
  entity: z.record(z.string(), z.unknown()).default({}),
  score: z.number().nullish(),
  level: z.enum(["LOW", "MEDIUM", "HIGH", "NEW", "INSUFFICIENT_HISTORY"]),
  signals: z.array(z.record(z.string(), z.unknown())).default([]),
  data_quality: z
    .enum(["GOOD", "PARTIAL", "POOR", "UNAVAILABLE"])
    .default("UNAVAILABLE"),
  evidence_ids: z.array(z.string()).default([]),
  confidence: unitInterval.default(0),
});
export type ReputationAssessment = z.infer<typeof ReputationAssessment>;

export const AnomalyAssessment = z.object({
  schema_version: z.literal("anomaly_assessment.v1").default("anomaly_assessment.v1"),
  score: z.number().nullish(),
  level: z.enum(["LOW", "MEDIUM", "HIGH", "INSUFFICIENT_EVIDENCE"]),
  signals: z.array(z.record(z.string(), z.unknown())).default([]),
  baseline_reference: z.record(z.string(), z.unknown()).nullish(),
  confidence: unitInterval.default(0),
  evidence_ids: z.array(z.string()).default([]),
});
export type AnomalyAssessment = z.infer<typeof AnomalyAssessment>;

export const RiskAssessment = z.object({
  schema_version: z.literal("risk_assessment.v1").default("risk_assessment.v1"),
  score: z.number().nullish(),
  level: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL", "INSUFFICIENT_EVIDENCE"]),
  dimensions: z.record(z.string(), z.number()).default({}),
  drivers: z.array(z.string()).default([]),
  confidence: unitInterval.default(0),
  evidence_ids: z.array(z.string()).default([]),
});
export type RiskAssessment = z.infer<typeof RiskAssessment>;

export const OverallAssessment = z.object({
  status: z.enum([
    "LOW_RISK",
    "MEDIUM_RISK",
    "HIGH_RISK",
    "INSUFFICIENT_EVIDENCE",
  ]),
  confidence: unitInterval,
  summary: z.string(),
  // Advisory only. NOT "authorized"/"allow". Core owns the real decision.
  recommended_handling: z.enum([
    "PROCEED_CANDIDATE",
    "MONITOR",
    "REVIEW",
    "DENY_RECOMMENDED",
  ]),
});
export type OverallAssessment = z.infer<typeof OverallAssessment>;

export const SecurityAssessment = z.object({
  schema_version: z
    .literal("security_assessment.v1")
    .default("security_assessment.v1"),
  assessment_id: idString,
  proposal_id: idString,
  intent_verification: IntentVerificationResult,
  threat_assessment: ThreatAssessment,
  reputation_assessment: ReputationAssessment,
  anomaly_assessment: AnomalyAssessment,
  risk_assessment: RiskAssessment,
  overall_assessment: OverallAssessment,
  explanation: z.string().default(""),
  // ML side allows ModelMetadata | dict | null; mirror leniently.
  model_metadata: z
    .union([ModelMetadata, z.record(z.string(), z.unknown())])
    .nullish(),
  created_at: isoTimestamp,
});
export type SecurityAssessment = z.infer<typeof SecurityAssessment>;

/**
 * The set of field names that must NEVER appear on an advisory AI contract. Exported
 * so the authority-boundary tests can assert their absence programmatically across
 * the assessment and all sub-assessments.
 */
export const FORBIDDEN_AUTHORITY_FIELDS = [
  "authorized",
  "execute",
  "sign",
  "allow",
  "authorization",
  "signature",
  "private_key",
] as const;
