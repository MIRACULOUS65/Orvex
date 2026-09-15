"""POST /agent/run — run the Agent Brain to produce an ActionProposal (Requirement 3.1).

Input: intent + execution context + optional supplied research context (search
results, blockchain context). Output: plan summary, evidence refs, ActionProposal,
trajectory refs, model metadata. NEVER returns execution authorization (3.5).

The endpoint accepts caller-supplied `observations`/`search_results` so that real
integrations feed real data and the demo can inject (untrusted) web content for the
payment-redirection scenario without the service needing a live search key.
"""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from agents.brain.graph import AgentBrain
from gateway.middleware.correlation import RequestContext, correlation_context
from memory.short_term.session_state import ExecutionContext, TrajectoryBuffer
from schemas.envelope import Envelope, Metadata
from tools.registry_config import build_default_registry
from tools.search.search_tool import SearchResult

router = APIRouter(tags=["agent"])


class SuppliedSearchResult(BaseModel):
    title: str
    url: str
    snippet: str


class AgentRunRequest(BaseModel):
    execution_id: str
    agent_id: str
    intent: dict
    max_iterations: int = 2
    # Optional injected research context (untrusted; real integrations supply real data).
    search_results: list[SuppliedSearchResult] = Field(default_factory=list)
    blockchain_context: dict[str, dict] = Field(default_factory=dict)


class AgentRunResult(BaseModel):
    plan_summary: str
    proposal: dict | None
    no_candidate_reason: str | None
    evidence_ids: list[str]
    trajectory_event_ids: list[str]
    trajectory: list[dict]
    model_provider_chain: list[str]


def _router_dep():
    from gateway.app import get_primary_provider

    return get_primary_provider()


@router.post("/agent/run", response_model=Envelope[AgentRunResult])
async def run_agent(
    req: AgentRunRequest,
    ctx: RequestContext = Depends(correlation_context),
    provider=Depends(_router_dep),
) -> Envelope[AgentRunResult]:
    start = time.perf_counter()

    context = ExecutionContext(
        execution_id=req.execution_id,
        agent_id=req.agent_id,
        intent_id=req.intent.get("intent_id"),
        tenant_id=ctx.tenant_id,
        correlation_id=ctx.correlation_id,
        max_iterations=req.max_iterations,
    )
    trajectory = TrajectoryBuffer(context)

    # Build a per-request search backend from any supplied results (untrusted).
    supplied = [SearchResult(**r.model_dump()) for r in req.search_results]

    async def _backend(query: str, max_results: int):
        return supplied[:max_results]

    registry = build_default_registry(
        search_backend=_backend,
        blockchain_context=req.blockchain_context,
    )

    brain = AgentBrain(
        provider=provider,
        registry=registry,
        context=context,
        trajectory=trajectory,
    )
    final_state = await brain.run(req.intent)

    result = AgentRunResult(
        plan_summary=final_state.get("plan_summary", ""),
        proposal=final_state.get("proposal"),
        no_candidate_reason=final_state.get("no_candidate_reason"),
        evidence_ids=final_state.get("evidence_ids", []),
        trajectory_event_ids=trajectory.event_ids,
        trajectory=[e.model_dump() for e in trajectory.events],
        model_provider_chain=[p.name for p in provider.providers],
    )
    metadata = Metadata(latency_ms=(time.perf_counter() - start) * 1000)
    return Envelope(request_id=ctx.request_id, status="OK", data=result, metadata=metadata)
