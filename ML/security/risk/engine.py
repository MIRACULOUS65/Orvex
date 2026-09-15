"""Risk Engine — DETERMINISTIC aggregator of upstream security signals.

Not an LLM (Requirement 8d.1, PRD_AIML "no opaque all-in-one model"). Combines the
already-computed intent/threat/reputation/anomaly assessments into risk dimensions
and an overall level, with named drivers. It does NOT map to ALLOW/REVIEW/DENY —
that is Core's exclusive job (Requirement 8d.3).
"""

from __future__ import annotations

from schemas.security_assessment import (
    AnomalyAssessment,
    IntentVerificationResult,
    ReputationAssessment,
    RiskAssessment,
    ThreatAssessment,
)

_SEVERITY_RISK = {None: 0.0, "LOW": 0.2, "MEDIUM": 0.5, "HIGH": 0.85, "CRITICAL": 1.0}
_ANOMALY_RISK = {"LOW": 0.2, "MEDIUM": 0.5, "HIGH": 0.85, "INSUFFICIENT_EVIDENCE": 0.5}
_REP_RISK = {
    "LOW": 0.15,
    "MEDIUM": 0.4,
    "HIGH": 0.9,
    "NEW": 0.5,
    "INSUFFICIENT_HISTORY": 0.5,
}


class RiskEngine:
    def aggregate(
        self,
        *,
        intent_v: IntentVerificationResult,
        threat: ThreatAssessment,
        reputation: ReputationAssessment,
        anomaly: AnomalyAssessment,
    ) -> RiskAssessment:
        drivers: list[str] = []

        intent_risk = {"FAIL": 0.95, "UNCERTAIN": 0.6, "INSUFFICIENT_EVIDENCE": 0.6, "PASS": 0.05}[
            intent_v.status
        ]
        if intent_v.status == "FAIL":
            drivers.append("proposal does not match original intent")

        threat_risk = _SEVERITY_RISK.get(threat.severity, 0.0)
        if threat.detected and threat.severity in ("HIGH", "CRITICAL"):
            drivers.append(f"threat detected: {', '.join(threat.categories) or 'unspecified'}")

        recipient_risk = _REP_RISK.get(reputation.level, 0.5)
        if reputation.level == "HIGH":
            drivers.append("recipient has a known risk label")
        elif reputation.level in ("NEW", "INSUFFICIENT_HISTORY"):
            drivers.append("recipient is new / lacks history")

        anomaly_risk = _ANOMALY_RISK.get(anomaly.level, 0.5)
        if anomaly.level == "HIGH":
            drivers.append("behavioral anomaly detected")

        dimensions = {
            "intent_risk": round(intent_risk, 3),
            "threat_risk": round(threat_risk, 3),
            "recipient_risk": round(recipient_risk, 3),
            "anomaly_risk": round(anomaly_risk, 3),
        }

        # Overall = max-dominant (a single hard signal should drive risk up),
        # blended with the mean so multiple mild signals also raise it.
        max_component = max(dimensions.values())
        mean_component = sum(dimensions.values()) / len(dimensions)
        overall = round(0.7 * max_component + 0.3 * mean_component, 3)

        # Hard-signal floors: a definitive intent mismatch or a HIGH/CRITICAL threat
        # is a blocking-class condition — risk must not be averaged down below HIGH.
        if intent_v.status == "FAIL" or threat.severity in ("HIGH", "CRITICAL"):
            overall = max(overall, 0.85)

        level = "LOW"
        if overall >= 0.8:
            level = "CRITICAL" if overall >= 0.9 else "HIGH"
        elif overall >= 0.45:
            level = "MEDIUM"

        # Represent genuine uncertainty explicitly.
        if (
            intent_v.status == "INSUFFICIENT_EVIDENCE"
            and anomaly.level == "INSUFFICIENT_EVIDENCE"
            and reputation.data_quality == "UNAVAILABLE"
        ):
            level = "INSUFFICIENT_EVIDENCE"

        return RiskAssessment(
            score=overall,
            level=level,
            dimensions=dimensions,
            drivers=drivers or ["no significant risk drivers"],
            confidence=0.8,
            evidence_ids=list(dict.fromkeys(intent_v.evidence_ids + threat.evidence_ids)),
        )
