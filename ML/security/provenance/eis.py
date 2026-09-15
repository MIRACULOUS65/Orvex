"""Epistemic Independence Scorer.

Given threat alerts with derived_from provenance, computes raw_alert_count vs
independent_root_count (Requirement 8f). Repetition is not independence. Produces
scored intelligence only; Core policy decides the response (8f.3).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from memory.provenance.evidence_graph import build_graph_from_evidence
from schemas.eis import EpistemicIndependenceAssessment


class EpistemicIndependenceScorer:
    def score(
        self,
        *,
        alerts: list[dict],
        incident_id: str | None = None,
    ) -> EpistemicIndependenceAssessment:
        graph = build_graph_from_evidence(alerts)
        raw = graph.raw_count()
        roots = graph.independent_root_count()

        # Confidence grows with independent roots, not raw volume.
        confidence = min(0.5 + 0.15 * roots, 0.99) if roots else 0.2
        credibility = _avg_credibility(alerts)

        handling = "MONITOR"
        if roots >= 3 and confidence >= 0.8:
            handling = "REVIEW"

        return EpistemicIndependenceAssessment(
            incident_id=incident_id or f"incident_{uuid.uuid4().hex[:8]}",
            raw_alert_count=raw,
            independent_root_count=roots,
            independence_score=roots,
            confidence_score=round(confidence, 3),
            source_credibility=round(credibility, 3),
            evidence_type=_dominant_type(alerts),
            recommended_handling=handling,
            evidence_ids=[a.get("evidence_id") for a in alerts if a.get("evidence_id")],
            created_at=datetime.now(timezone.utc).isoformat(),
        )


def _avg_credibility(alerts: list[dict]) -> float:
    trust_weight = {"TRUSTED": 1.0, "INTERNAL": 0.8, "EXTERNAL": 0.5, "UNTRUSTED": 0.2, "UNKNOWN": 0.3}
    vals = []
    for a in alerts:
        src = a.get("source", {}) if isinstance(a.get("source"), dict) else {}
        vals.append(trust_weight.get(src.get("trust_level"), 0.3))
    return sum(vals) / len(vals) if vals else 0.0


def _dominant_type(alerts: list[dict]) -> str | None:
    types = [
        (a.get("source", {}) or {}).get("source_type")
        for a in alerts
        if isinstance(a.get("source"), dict)
    ]
    types = [t for t in types if t]
    return max(set(types), key=types.count) if types else None
