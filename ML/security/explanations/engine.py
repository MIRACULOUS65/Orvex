"""Explanation Engine — evidence-grounded, deterministic natural-language summary.

Builds the explanation from the STRUCTURED assessment outputs (which already cite
evidence/trajectory ids), so every statement is grounded (Requirement 8g). This
implementation is deterministic (no free-text LLM invention), which structurally
guarantees it cannot assert unsupported facts — the strongest form of grounding.
"""

from __future__ import annotations

from schemas.security_assessment import (
    AnomalyAssessment,
    IntentVerificationResult,
    ReputationAssessment,
    RiskAssessment,
    ThreatAssessment,
)


class ExplanationEngine:
    def explain(
        self,
        *,
        intent_v: IntentVerificationResult,
        threat: ThreatAssessment,
        reputation: ReputationAssessment,
        anomaly: AnomalyAssessment,
        risk: RiskAssessment,
    ) -> str:
        lines: list[str] = [f"Overall risk: {risk.level}."]
        n = 1

        if intent_v.status != "PASS":
            for reason in intent_v.reasons:
                lines.append(f"{n}. Intent: {reason}")
                n += 1

        if threat.detected:
            cats = ", ".join(threat.categories) or "unspecified"
            detail = threat.explanation.strip()
            lines.append(f"{n}. Threat ({threat.severity}, {cats}). {detail}".strip())
            n += 1

        if reputation.level in ("NEW", "INSUFFICIENT_HISTORY", "HIGH"):
            desc = {
                "NEW": "Recipient is new with no prior history (new is not the same as malicious).",
                "INSUFFICIENT_HISTORY": "Insufficient recipient history to assess reputation.",
                "HIGH": "Recipient carries a known risk label.",
            }[reputation.level]
            lines.append(f"{n}. Reputation: {desc}")
            n += 1

        if anomaly.level in ("MEDIUM", "HIGH"):
            sig = "; ".join(s.get("description", "") for s in anomaly.signals)
            lines.append(f"{n}. Anomaly ({anomaly.level}): {sig}")
            n += 1

        if risk.drivers:
            lines.append("Risk drivers: " + "; ".join(risk.drivers) + ".")

        if len(lines) == 1:
            lines.append("No security concerns detected; proposal is consistent with intent.")

        return "\n".join(lines)
