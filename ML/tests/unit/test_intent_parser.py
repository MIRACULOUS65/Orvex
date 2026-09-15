"""Intent parser tests (Requirement 2.3, 2.4, 13.1).

Covers: normal, ambiguous (missing budget), missing autonomy, invented-value
prevention, and conflicting/partial constraints. Uses a scripted provider so the
deterministic post-checks are exercised independently of any real model.
"""

from __future__ import annotations

import pytest

from agents.intent.parser import IntentParser
from models.provider.base import (
    GenerationRequest,
    ModelMetadata,
    ModelProvider,
    ModelResponse,
)


class ScriptedProvider(ModelProvider):
    """Returns a fixed structured payload — simulates the LLM's extraction."""

    name = "scripted"

    def __init__(self, structured: dict):
        self._structured = structured

    async def health(self) -> bool:
        return True

    def _meta(self, request: GenerationRequest) -> ModelMetadata:
        return ModelMetadata(
            provider=self.name,
            model="scripted",
            model_version="v1",
            configuration_version="config-v1",
            prompt_version=request.prompt_version,
            temperature=request.temperature,
            timestamp="2026-09-11T00:00:00Z",
        )

    async def generate(self, request: GenerationRequest) -> ModelResponse:
        raise NotImplementedError

    async def generate_structured(self, request: GenerationRequest, schema: type) -> ModelResponse:
        return ModelResponse(
            text=None,
            structured=self._structured,
            tool_calls=[],
            metadata=self._meta(request),
            latency_ms=1.0,
            token_usage=None,
            modality_support=frozenset({"text", "structured_json"}),
        )


async def _parse(structured: dict):
    parser = IntentParser(ScriptedProvider(structured))
    return await parser.parse(user_goal="test goal", agent_id="agent_001")


@pytest.mark.asyncio
async def test_normal_intent_is_valid():
    intent = await _parse(
        {
            "purpose": "market_data_access",
            "desired_outcome": "usable market data",
            "budget": {"maximum": "10.00", "currency": "USD", "period": "daily"},
            "autonomy_level": "AUTOMATIC",
            "authorized_actions": ["PAY"],
        }
    )
    assert intent.status == "VALID"
    assert intent.budget.maximum == "10.00"
    assert intent.budget.currency == "USD"
    assert intent.autonomy_level == "AUTOMATIC"
    assert intent.ambiguities == []


@pytest.mark.asyncio
async def test_missing_budget_needs_clarification():
    intent = await _parse(
        {
            "purpose": "buy_something",
            "desired_outcome": "a good laptop",
            "budget": None,
            "autonomy_level": "AUTOMATIC",
        }
    )
    assert intent.status == "NEEDS_CLARIFICATION"
    assert intent.budget is None
    fields = {a.field for a in intent.ambiguities}
    assert "budget.maximum" in fields


@pytest.mark.asyncio
async def test_missing_autonomy_needs_clarification():
    intent = await _parse(
        {
            "purpose": "api_access",
            "desired_outcome": "api access",
            "budget": {"maximum": "5.00", "currency": "USDC"},
            "autonomy_level": None,
        }
    )
    assert intent.status == "NEEDS_CLARIFICATION"
    assert any(a.field == "autonomy_level" for a in intent.ambiguities)
    # Safe default posture is MANUAL, but still flagged as ambiguous.
    assert intent.autonomy_level == "MANUAL"


@pytest.mark.asyncio
async def test_parser_never_invents_budget_amount():
    # Model returned a non-decimal garbage amount; parser must reject, not coerce.
    intent = await _parse(
        {
            "purpose": "api_access",
            "desired_outcome": "api",
            "budget": {"maximum": "about ten dollars", "currency": "USD"},
            "autonomy_level": "AUTOMATIC",
        }
    )
    assert intent.budget is None
    assert intent.status == "NEEDS_CLARIFICATION"
    assert any(a.field == "budget.maximum" for a in intent.ambiguities)


@pytest.mark.asyncio
async def test_budget_amount_is_decimal_string_not_float():
    intent = await _parse(
        {
            "purpose": "api_access",
            "desired_outcome": "api",
            "budget": {"maximum": "4.20", "currency": "USDC", "period": "once"},
            "autonomy_level": "CONDITIONAL",
        }
    )
    assert isinstance(intent.budget.maximum, str)
    assert intent.budget.maximum == "4.20"


@pytest.mark.asyncio
async def test_missing_currency_needs_clarification():
    intent = await _parse(
        {
            "purpose": "api_access",
            "desired_outcome": "api",
            "budget": {"maximum": "10.00"},
            "autonomy_level": "AUTOMATIC",
        }
    )
    assert intent.status == "NEEDS_CLARIFICATION"
    assert intent.budget is None
    assert any(a.field == "budget.currency" for a in intent.ambiguities)


@pytest.mark.asyncio
async def test_schema_version_and_ids_present():
    intent = await _parse(
        {
            "purpose": "api_access",
            "desired_outcome": "api",
            "budget": {"maximum": "10.00", "currency": "USD"},
            "autonomy_level": "AUTOMATIC",
        }
    )
    assert intent.schema_version == "intent.v1"
    assert intent.intent_id.startswith("intent_")
    assert intent.agent_id == "agent_001"
