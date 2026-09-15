"""POST /intent/parse — natural language goal -> structured Intent (Requirement 2.1)."""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from agents.intent.parser import IntentParser
from gateway.middleware.correlation import RequestContext, correlation_context
from schemas.envelope import Envelope, Metadata
from schemas.intent import Intent

router = APIRouter(tags=["intent"])


class IntentParseRequest(BaseModel):
    execution_id: str
    agent_id: str
    user_goal: str = Field(min_length=1)
    user_id: str | None = None
    validity_hours: int = 24


def _parser() -> IntentParser:
    from gateway.app import get_primary_provider

    provider = get_primary_provider()
    return IntentParser(provider)


@router.post("/intent/parse", response_model=Envelope[Intent])
async def parse_intent(
    req: IntentParseRequest,
    ctx: RequestContext = Depends(correlation_context),
    parser: IntentParser = Depends(_parser),
) -> Envelope[Intent]:
    start = time.perf_counter()
    intent = await parser.parse(
        user_goal=req.user_goal,
        agent_id=req.agent_id,
        user_id=req.user_id,
        validity_hours=req.validity_hours,
    )
    metadata = Metadata(latency_ms=(time.perf_counter() - start) * 1000)
    status = "NEEDS_CLARIFICATION" if intent.needs_clarification() else "OK"
    return Envelope(request_id=ctx.request_id, status=status, data=intent, metadata=metadata)
