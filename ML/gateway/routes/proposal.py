"""POST /proposal/analyze — full AI security pipeline over a proposal (Requirement 8.1).

Same pipeline as /security/analyze; this is the Core-facing entry point that takes
an Intent + ActionProposal (+ context) and returns one SecurityAssessment.
"""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from gateway.middleware.correlation import RequestContext, correlation_context
from schemas.envelope import Envelope, Metadata
from schemas.security_assessment import SecurityAssessment
from security.graph import SecurityPipeline

router = APIRouter(tags=["proposal"])


class ProposalAnalyzeRequest(BaseModel):
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


@router.post("/proposal/analyze", response_model=Envelope[SecurityAssessment])
async def analyze_proposal(
    req: ProposalAnalyzeRequest,
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
