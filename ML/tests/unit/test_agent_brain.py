"""Agent Brain tests (Requirements 3.1, 3.2, 3.3, 3.4, 3.5)."""

from __future__ import annotations

import pytest

from agents.brain.graph import AgentBrain
from config.settings import AppConfig
from memory.short_term.session_state import ExecutionContext, TrajectoryBuffer
from models.provider.base import GenerationRequest, ModelMetadata, ModelProvider, ModelResponse
from models.provider.router import ProviderRouter
from schemas.action_proposal import ActionProposal
from tools.registry_config import build_default_registry
from tools.search.search_tool import SearchResult


def _meta() -> ModelMetadata:
    return ModelMetadata("scripted", "m", "v1", "config-v1", "v1", 0.0, "2026-09-11T00:00:00Z")


class ScriptedBrainProvider(ModelProvider):
    """Returns plan_v1 / compare_v1 responses based on prompt_version."""

    name = "scripted"

    def __init__(self, *, select_candidate: bool = True):
        self._select = select_candidate

    async def health(self):
        return True

    async def generate(self, request):
        raise NotImplementedError

    async def generate_structured(self, request: GenerationRequest, schema):
        if request.prompt_version == "plan_v1":
            structured = {"plan": ["search providers", "compare to budget"]}
        elif request.prompt_version == "compare_v1":
            if self._select:
                structured = {
                    "selected_candidate": {
                        "action_type": "PAY",
                        "purpose": "market_data_api",
                        "recipient": {"type": "SERVICE", "identifier": "ExampleAPI"},
                        "amount": {"value": "4.20", "currency": "USDC"},
                        "payment_method": "X402",
                        "reason": "Cheapest provider within budget.",
                    }
                }
            else:
                structured = {"selected_candidate": None, "reason": "No provider within budget."}
        else:
            structured = {}
        return ModelResponse(None, structured, [], _meta(), 1.0, None, frozenset({"text"}))


def _intent() -> dict:
    return {
        "intent_id": "intent_1",
        "purpose": "market_data_api",
        "user_goal": "find a market data API under $10",
        "budget": {"maximum": "10", "currency": "USDC", "period": "daily"},
        "autonomy_level": "AUTOMATIC",
    }


def _brain(provider_double, *, search_results=None, max_iter=4) -> AgentBrain:
    config = AppConfig(model_max_retries=0)
    router = ProviderRouter([provider_double], config)
    ctx = ExecutionContext(execution_id="e1", agent_id="a1", intent_id="intent_1", max_iterations=max_iter)
    traj = TrajectoryBuffer(ctx)

    async def _backend(query, n):
        return (search_results or [])[:n]

    registry = build_default_registry(search_backend=_backend)
    return AgentBrain(provider=router, registry=registry, context=ctx, trajectory=traj)


@pytest.mark.asyncio
async def test_agent_produces_valid_action_proposal():
    results = [SearchResult(title="ExampleAPI", url="https://ex.com", snippet="market data api $4/mo")]
    brain = _brain(ScriptedBrainProvider(select_candidate=True), search_results=results)
    state = await brain.run(_intent())
    assert state["proposal"] is not None
    proposal = ActionProposal(**state["proposal"])
    assert proposal.action_type == "PAY"
    assert proposal.amount.value == "4.20"
    assert proposal.intent_id == "intent_1"
    assert proposal.evidence_ids  # references evidence
    assert proposal.trajectory_event_ids  # references trajectory


@pytest.mark.asyncio
async def test_agent_returns_no_proposal_when_no_candidate():
    brain = _brain(ScriptedBrainProvider(select_candidate=False), max_iter=2)
    state = await brain.run(_intent())
    assert state["proposal"] is None
    assert state["no_candidate_reason"]


@pytest.mark.asyncio
async def test_research_loop_is_bounded():
    # Never selects a candidate -> must stop at max_iterations, not loop forever.
    brain = _brain(ScriptedBrainProvider(select_candidate=False), max_iter=2)
    state = await brain.run(_intent())
    assert state["iterations"] <= 2


@pytest.mark.asyncio
async def test_proposal_has_no_authority_fields():
    # ActionProposal schema must not carry authorization fields (Requirement 21).
    fields = set(ActionProposal.model_fields.keys())
    for forbidden in ("authorized", "execute", "allow", "approved", "signature"):
        assert forbidden not in fields


@pytest.mark.asyncio
async def test_trajectory_records_plan_and_proposal():
    results = [SearchResult(title="ExampleAPI", url="https://ex.com", snippet="api")]
    brain = _brain(ScriptedBrainProvider(select_candidate=True), search_results=results)
    await brain.run(_intent())
    types = [e.event_type for e in brain._trajectory.events]
    assert "PLAN_CREATED" in types
    assert "PROPOSAL_CREATED" in types
    assert brain._trajectory.verify_chain() is True
