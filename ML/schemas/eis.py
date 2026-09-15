"""Epistemic Independence Assessment — mirrors CONTRACTS.md §42.

Distinguishes raw alert count from the number of INDEPENDENT evidence roots. Produces
scored intelligence only; it does NOT own the downstream response (Requirement 8f.3).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class EpistemicIndependenceAssessment(BaseModel):
    schema_version: Literal["epistemic_assessment.v1"] = "epistemic_assessment.v1"
    incident_id: str
    raw_alert_count: int
    independent_root_count: int
    independence_score: int
    confidence_score: float = 0.0
    source_credibility: float = 0.0
    evidence_type: str | None = None
    provenance_graph_reference: str | None = None
    recommended_handling: Literal["MONITOR", "REVIEW", "DENY_RECOMMENDED"] = "MONITOR"
    evidence_ids: list[str] = Field(default_factory=list)
    created_at: str | None = None
