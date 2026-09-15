"""SecurityAssessment schemas — mirror CONTRACTS.md §15-21.

The primary AI/ML output to Core. It is ADVISORY intelligence, never authorization
(CONTRACTS.md §21, Requirement 8.2/8.3). There is deliberately NO field named or
semantically equal to `authorized`/`execute`/`allow`. The only decision-shaped
field is `recommended_handling`, which Core is free to disregard.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from schemas.model_metadata import ModelMetadata

# ---- Sub-assessments ---------------------------------------------------- #


class IntentVerificationResult(BaseModel):
    schema_version: Literal["intent_verification.v1"] = "intent_verification.v1"
    status: Literal["PASS", "FAIL", "UNCERTAIN", "INSUFFICIENT_EVIDENCE"]
    intent_match: bool
    score: float
    dimensions: dict[str, float] = Field(default_factory=dict)
    violations: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    confidence: float = 0.0


class ThreatAssessment(BaseModel):
    schema_version: Literal["threat_assessment.v1"] = "threat_assessment.v1"
    detected: bool
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] | None = None
    categories: list[str] = Field(default_factory=list)
    confidence: float = 0.0
    evidence_ids: list[str] = Field(default_factory=list)
    trajectory_event_ids: list[str] = Field(default_factory=list)
    explanation: str = ""
    recommended_handling: Literal["MONITOR", "REVIEW", "DENY_RECOMMENDED"] = "MONITOR"


class ReputationAssessment(BaseModel):
    schema_version: Literal["reputation_assessment.v1"] = "reputation_assessment.v1"
    entity: dict = Field(default_factory=dict)
    score: float | None = None
    level: Literal["LOW", "MEDIUM", "HIGH", "NEW", "INSUFFICIENT_HISTORY"]
    signals: list[dict] = Field(default_factory=list)
    data_quality: Literal["GOOD", "PARTIAL", "POOR", "UNAVAILABLE"] = "UNAVAILABLE"
    evidence_ids: list[str] = Field(default_factory=list)
    confidence: float = 0.0


class AnomalyAssessment(BaseModel):
    schema_version: Literal["anomaly_assessment.v1"] = "anomaly_assessment.v1"
    score: float | None = None
    level: Literal["LOW", "MEDIUM", "HIGH", "INSUFFICIENT_EVIDENCE"]
    signals: list[dict] = Field(default_factory=list)
    baseline_reference: dict | None = None
    confidence: float = 0.0
    evidence_ids: list[str] = Field(default_factory=list)


class RiskAssessment(BaseModel):
    schema_version: Literal["risk_assessment.v1"] = "risk_assessment.v1"
    score: float | None = None
    level: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL", "INSUFFICIENT_EVIDENCE"]
    dimensions: dict[str, float] = Field(default_factory=dict)
    drivers: list[str] = Field(default_factory=list)
    confidence: float = 0.0
    evidence_ids: list[str] = Field(default_factory=list)


class OverallAssessment(BaseModel):
    status: Literal["LOW_RISK", "MEDIUM_RISK", "HIGH_RISK", "INSUFFICIENT_EVIDENCE"]
    confidence: float
    summary: str
    # Advisory only. NOT "authorized"/"allow". Core owns the real decision.
    recommended_handling: Literal[
        "PROCEED_CANDIDATE", "MONITOR", "REVIEW", "DENY_RECOMMENDED"
    ]


class SecurityAssessment(BaseModel):
    schema_version: Literal["security_assessment.v1"] = "security_assessment.v1"
    assessment_id: str
    proposal_id: str
    intent_verification: IntentVerificationResult
    threat_assessment: ThreatAssessment
    reputation_assessment: ReputationAssessment
    anomaly_assessment: AnomalyAssessment
    risk_assessment: RiskAssessment
    overall_assessment: OverallAssessment
    explanation: str = ""
    evidence_ids: list[str] = Field(default_factory=list)
    model_metadata: ModelMetadata | dict | None = None
    created_at: str
