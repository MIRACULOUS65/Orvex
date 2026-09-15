"""Security graph state (LangGraph). Plain TypedDict of the analysis context."""

from __future__ import annotations

from typing import TypedDict


class SecurityState(TypedDict, total=False):
    # Inputs
    intent: dict
    proposal: dict
    trajectory: list[dict]
    evidence: list[dict]
    recipient_context: dict | None
    historical_behavior: dict | None

    # Sub-assessment outputs (dicts of the pydantic models)
    intent_verification: dict
    threat_assessment: dict
    reputation_assessment: dict
    anomaly_assessment: dict
    risk_assessment: dict
    explanation: str
