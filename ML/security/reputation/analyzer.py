"""Reputation Analyzer — interprets caller-supplied recipient context.

Does NOT query any chain (Requirement 8c.1). Critically: NEW / no-history is
classified as NEW / INSUFFICIENT_HISTORY, never 'malicious' (Requirement 8c.2,
SECURITY_MODEL.md §34/§98). Missing context -> data_quality UNAVAILABLE (8c.3).
"""

from __future__ import annotations

from schemas.security_assessment import ReputationAssessment


class ReputationAnalyzer:
    def analyze(self, recipient_context: dict | None, entity: dict | None = None) -> ReputationAssessment:
        entity = entity or {}
        if not recipient_context:
            return ReputationAssessment(
                entity=entity,
                score=None,
                level="INSUFFICIENT_HISTORY",
                signals=[{"type": "NO_CONTEXT", "description": "No recipient context supplied."}],
                data_quality="UNAVAILABLE",
                confidence=0.3,
            )

        age_days = recipient_context.get("address_age_days")
        tx_count = recipient_context.get("transaction_count", 0)
        known_labels = recipient_context.get("known_labels", []) or []
        risk_labels = recipient_context.get("risk_labels", []) or []
        prior_interactions = recipient_context.get("prior_agent_interactions", 0)

        signals: list[dict] = []
        # Known malicious label is the only thing that makes reputation HIGH-risk.
        if risk_labels:
            signals.append({"type": "KNOWN_RISK_LABEL", "severity": "HIGH", "description": str(risk_labels)})
            return ReputationAssessment(
                entity=entity,
                score=0.1,
                level="HIGH",
                signals=signals,
                data_quality="GOOD",
                confidence=0.85,
            )

        # New / unknown recipient -> NEW, not malicious.
        if (age_days in (None, 0)) and tx_count == 0 and not known_labels and prior_interactions == 0:
            return ReputationAssessment(
                entity=entity,
                score=None,
                level="NEW",
                signals=[{"type": "NEW_RECIPIENT", "description": "No prior history observed."}],
                data_quality="PARTIAL",
                confidence=0.5,
            )

        # Otherwise derive a soft score from positive signals.
        score = 0.5
        if age_days and age_days > 180:
            score += 0.2
            signals.append({"type": "LONG_LIVED_ADDRESS", "severity": "LOW", "description": f"{age_days}d old"})
        if prior_interactions > 0:
            score += 0.2
            signals.append({"type": "PRIOR_INTERACTION", "severity": "LOW", "description": str(prior_interactions)})
        if known_labels:
            score += 0.1
            signals.append({"type": "KNOWN_ENTITY", "severity": "LOW", "description": str(known_labels)})

        level = "LOW" if score >= 0.7 else "MEDIUM"
        return ReputationAssessment(
            entity=entity,
            score=round(min(score, 1.0), 3),
            level=level,
            signals=signals,
            data_quality="GOOD",
            confidence=0.7,
        )
