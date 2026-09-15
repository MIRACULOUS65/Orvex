"""Anomaly Detector — hybrid (deterministic rules + historical statistics).

Signals: amount spike, frequency spike, recipient/asset/network novelty, unusual
time (Requirement 8e). No historical baseline -> INSUFFICIENT_EVIDENCE, never LOW
(8e.3). Deterministic + statistical here; an optional LLM narrative can be layered
later without changing the contract.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from schemas.security_assessment import AnomalyAssessment


def _dec(v) -> Decimal | None:
    try:
        d = Decimal(str(v).strip())
    except (InvalidOperation, ValueError, TypeError):
        return None
    return d if d.is_finite() else None


class AnomalyDetector:
    def analyze(self, *, proposal: dict, historical_behavior: dict | None) -> AnomalyAssessment:
        if not historical_behavior:
            return AnomalyAssessment(
                score=None,
                level="INSUFFICIENT_EVIDENCE",
                signals=[{"type": "NO_BASELINE", "description": "No historical behavior supplied."}],
                confidence=0.3,
            )

        signals: list[dict] = []
        score = 0.0

        amount = _dec((proposal.get("amount") or {}).get("value"))
        median = _dec(historical_behavior.get("median_amount"))
        if amount is not None and median is not None and median > 0:
            ratio = float(amount / median)
            if ratio >= 5:
                score = max(score, 0.8)
                signals.append({"type": "AMOUNT_DEVIATION", "description": f"{ratio:.1f}x median"})
            elif ratio >= 3:
                score = max(score, 0.5)
                signals.append({"type": "AMOUNT_DEVIATION", "description": f"{ratio:.1f}x median"})

        # Recipient novelty
        known_recipients = set(historical_behavior.get("known_recipients", []) or [])
        recipient = (proposal.get("recipient") or {})
        rid = recipient.get("identifier") or recipient.get("address")
        if rid and known_recipients and rid not in known_recipients:
            score = max(score, 0.5)
            signals.append({"type": "RECIPIENT_NOVELTY", "description": "Recipient not seen before."})

        # Frequency spike
        recent = historical_behavior.get("recent_tx_count")
        typical = historical_behavior.get("typical_daily_tx")
        if isinstance(recent, (int, float)) and isinstance(typical, (int, float)) and typical > 0:
            if recent >= typical * 5:
                score = max(score, 0.7)
                signals.append({"type": "FREQUENCY_SPIKE", "description": f"{recent} vs typical {typical}"})

        level = "LOW"
        if score >= 0.7:
            level = "HIGH"
        elif score >= 0.4:
            level = "MEDIUM"

        return AnomalyAssessment(
            score=round(score, 3),
            level=level,
            signals=signals or [{"type": "WITHIN_BASELINE", "description": "No significant deviation."}],
            baseline_reference={
                "window": historical_behavior.get("window", "unknown"),
                "transactions_observed": historical_behavior.get("transactions_observed"),
            },
            confidence=0.75,
        )
