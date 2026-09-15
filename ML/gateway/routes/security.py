"""Security routes: /security/analyze + specialized sub-endpoints (Requirement 8)."""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from gateway.middleware.correlation import RequestContext, correlation_context
from schemas.envelope import Envelope, Metadata
from schemas.security_assessment import (
    AnomalyAssessment,
    IntentVerificationResult,
    ReputationAssessment,
    RiskAssessment,
    SecurityAssessment,
    ThreatAssessment,
)
from security.anomaly.detector import AnomalyDetector
from security.graph import SecurityPipeline
from security.intent_verifier.verifier import IntentVerifier
from security.provenance.eis import EpistemicIndependenceScorer
from security.reputation.analyzer import ReputationAnalyzer
from security.threat_detector.detector import ThreatDetector

router = APIRouter(tags=["security"])


class SecurityAnalyzeRequest(BaseModel):
    execution_id: str | None = None
    agent_id: str | None = None
    intent: dict
    proposal: dict
    trajectory: list[dict] = Field(default_factory=list)
    evidence: list[dict] = Field(default_factory=list)
    recipient_context: dict | None = None
    historical_behavior: dict | None = None


def _provider():
    from gateway.app import get_primary_provider

    return get_primary_provider()


@router.post("/security/analyze", response_model=Envelope[SecurityAssessment])
async def analyze_security(
    req: SecurityAnalyzeRequest,
    ctx: RequestContext = Depends(correlation_context),
    provider=Depends(_provider),
) -> Envelope[SecurityAssessment]:
    start = time.perf_counter()
    pipeline = SecurityPipeline(provider=provider)
    assessment = await pipeline.analyze(
        intent=req.intent,
        proposal=req.proposal,
        trajectory=req.trajectory,
        evidence=req.evidence,
        recipient_context=req.recipient_context,
        historical_behavior=req.historical_behavior,
    )
    metadata = Metadata(latency_ms=(time.perf_counter() - start) * 1000)
    return Envelope(request_id=ctx.request_id, status="OK", data=assessment, metadata=metadata)


# ---- Specialized internal endpoints ------------------------------------ #


@router.post("/security/intent-verify", response_model=Envelope[IntentVerificationResult])
async def intent_verify(
    req: SecurityAnalyzeRequest,
    ctx: RequestContext = Depends(correlation_context),
    provider=Depends(_provider),
) -> Envelope[IntentVerificationResult]:
    result = await IntentVerifier(provider).verify(
        intent=req.intent, proposal=req.proposal, trajectory=req.trajectory, evidence=req.evidence
    )
    return Envelope(request_id=ctx.request_id, status="OK", data=result)


@router.post("/security/threat", response_model=Envelope[ThreatAssessment])
async def threat(
    req: SecurityAnalyzeRequest,
    ctx: RequestContext = Depends(correlation_context),
    provider=Depends(_provider),
) -> Envelope[ThreatAssessment]:
    result = await ThreatDetector(provider).analyze(
        intent=req.intent, proposal=req.proposal, trajectory=req.trajectory, evidence=req.evidence
    )
    return Envelope(request_id=ctx.request_id, status="OK", data=result)


@router.post("/security/reputation", response_model=Envelope[ReputationAssessment])
async def reputation(
    req: SecurityAnalyzeRequest, ctx: RequestContext = Depends(correlation_context)
) -> Envelope[ReputationAssessment]:
    result = ReputationAnalyzer().analyze(req.recipient_context, entity=req.proposal.get("recipient") or {})
    return Envelope(request_id=ctx.request_id, status="OK", data=result)


@router.post("/security/anomaly", response_model=Envelope[AnomalyAssessment])
async def anomaly(
    req: SecurityAnalyzeRequest, ctx: RequestContext = Depends(correlation_context)
) -> Envelope[AnomalyAssessment]:
    result = AnomalyDetector().analyze(proposal=req.proposal, historical_behavior=req.historical_behavior)
    return Envelope(request_id=ctx.request_id, status="OK", data=result)


class ProvenanceRequest(BaseModel):
    alerts: list[dict]
    incident_id: str | None = None


@router.post("/security/provenance")
async def provenance(
    req: ProvenanceRequest, ctx: RequestContext = Depends(correlation_context)
) -> Envelope:
    result = EpistemicIndependenceScorer().score(alerts=req.alerts, incident_id=req.incident_id)
    return Envelope(request_id=ctx.request_id, status="OK", data=result)
