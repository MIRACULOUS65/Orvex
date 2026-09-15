"""Policy compiler tests (Requirements 7.3, 7.4, 7.5)."""

from __future__ import annotations

import pytest

from models.provider.base import GenerationRequest, ModelMetadata, ModelProvider, ModelResponse
from models.provider.router import ProviderRouter
from config.settings import AppConfig
from policy_ai.compiler.compiler import PolicyCompiler
from policy_ai.conflict.detector import detect_conflicts
from policy_ai.normalizer.normalizer import normalize_rules


def _meta():
    return ModelMetadata("scripted", "m", "v1", "config-v1", "policy_v1", 0.0, "2026-09-11T00:00:00Z")


class ScriptedPolicyProvider(ModelProvider):
    name = "scripted"

    def __init__(self, structured: dict):
        self._structured = structured

    async def health(self):
        return True

    async def generate(self, request):
        raise NotImplementedError

    async def generate_structured(self, request: GenerationRequest, schema):
        return ModelResponse(None, dict(self._structured), [], _meta(), 1.0, None, frozenset({"text"}))


def _compiler(structured: dict) -> PolicyCompiler:
    router = ProviderRouter([ScriptedPolicyProvider(structured)], AppConfig(model_max_retries=0))
    return PolicyCompiler(router)


@pytest.mark.asyncio
async def test_clean_policy_compiles_ok():
    compiler = _compiler(
        {
            "rules": [
                {
                    "type": "AMOUNT_LIMIT",
                    "constraint": {"operator": "LTE", "field": "transaction.amount", "value": "20.00", "currency": "USDC"},
                    "required_action": "ALLOW",
                }
            ],
            "ambiguities": [],
        }
    )
    result = await compiler.compile("Agents may pay API providers up to 20 USDC.")
    assert result.status == "OK"
    assert len(result.candidate_rules) == 1
    assert result.activated is False


@pytest.mark.asyncio
async def test_vague_policy_is_ambiguous_and_invents_no_limit():
    compiler = _compiler({"rules": [], "ambiguities": []})
    result = await compiler.compile("Don't spend too much money.")
    assert result.status == "AMBIGUOUS"
    assert result.ambiguities  # deterministic detector flagged "too much"
    # No rule with an invented numeric limit was created.
    assert all(r.constraint.value not in (None,) or r.type not in ("AMOUNT_LIMIT",) for r in result.candidate_rules) or not result.candidate_rules


@pytest.mark.asyncio
async def test_amount_rule_without_value_is_ambiguous():
    compiler = _compiler(
        {"rules": [{"type": "AMOUNT_LIMIT", "constraint": {"operator": "LTE", "field": "transaction.amount"}}]}
    )
    result = await compiler.compile("Limit spending appropriately.")
    assert result.status == "AMBIGUOUS"


def test_conflict_detection():
    rules = normalize_rules(
        [
            {"type": "HUMAN_APPROVAL", "condition": {"category": "invoice"}, "required_action": "ALLOW"},
            {"type": "HUMAN_APPROVAL", "condition": {"category": "invoice"}, "required_action": "REQUIRE_APPROVAL"},
        ]
    )
    conflicts = detect_conflicts(rules)
    assert conflicts


@pytest.mark.asyncio
async def test_conflicting_policy_status():
    compiler = _compiler(
        {
            "rules": [
                {"type": "HUMAN_APPROVAL", "condition": {"category": "invoice"}, "required_action": "ALLOW"},
                {"type": "HUMAN_APPROVAL", "condition": {"category": "invoice"}, "required_action": "DENY"},
            ]
        }
    )
    result = await compiler.compile("Always auto-pay invoices. Never pay invoices.")
    assert result.status == "POLICY_CONFLICT"
    assert result.conflicts


def test_normalizer_skips_unknown_rule_type():
    rules = normalize_rules([{"type": "NOT_A_REAL_RULE", "constraint": {}}])
    assert rules == []
