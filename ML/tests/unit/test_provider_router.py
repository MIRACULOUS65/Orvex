"""ProviderRouter tests (Requirements 5.3, 5.4, 5.5, 5.6).

Verifies fallback on failure, fail-closed AI_UNAVAILABLE when all providers fail,
repair-retry then MODEL_OUTPUT_INVALID on persistently malformed output, and that
the router never fabricates a 'safe' default.
"""

from __future__ import annotations

import pytest

from config.settings import AppConfig
from models.provider.base import (
    GenerationRequest,
    ModelMetadata,
    ModelProvider,
    ModelResponse,
)
from models.provider.router import ProviderRouter
from schemas.errors import AIUnavailableError, ModelOutputInvalidError


def _meta(name: str) -> ModelMetadata:
    return ModelMetadata(
        provider=name,
        model="m",
        model_version="v1",
        configuration_version="config-v1",
        prompt_version="v1",
        temperature=0.0,
        timestamp="2026-09-11T00:00:00Z",
    )


class HealthyStructured(ModelProvider):
    def __init__(self, name: str, structured: dict):
        self.name = name
        self._structured = structured

    async def health(self) -> bool:
        return True

    async def generate(self, request):
        return ModelResponse("text", None, [], _meta(self.name), 1.0, None, frozenset({"text"}))

    async def generate_structured(self, request, schema):
        return ModelResponse(None, dict(self._structured), [], _meta(self.name), 1.0, None, frozenset({"text"}))


class AlwaysFails(ModelProvider):
    def __init__(self, name: str):
        self.name = name

    async def health(self) -> bool:
        return True

    async def generate(self, request):
        raise RuntimeError("boom")

    async def generate_structured(self, request, schema):
        raise RuntimeError("boom")


class AlwaysEmpty(ModelProvider):
    """Returns an empty structured dict every time -> invalid after repair."""

    def __init__(self, name: str):
        self.name = name

    async def health(self) -> bool:
        return True

    async def generate(self, request):
        return ModelResponse("text", None, [], _meta(self.name), 1.0, None, frozenset({"text"}))

    async def generate_structured(self, request, schema):
        return ModelResponse(None, {}, [], _meta(self.name), 1.0, None, frozenset({"text"}))


_CONFIG = AppConfig(model_max_retries=1, model_timeout_s=5.0)
_REQUEST = GenerationRequest(system_prompt="s", messages=[{"role": "user", "content": "hi"}])


@pytest.mark.asyncio
async def test_falls_back_to_second_provider_on_failure():
    router = ProviderRouter([AlwaysFails("groq"), HealthyStructured("nvidia", {"ok": True})], _CONFIG)
    resp = await router.generate_structured(_REQUEST, dict)
    assert resp.structured == {"ok": True}
    assert resp.metadata.provider == "nvidia"


@pytest.mark.asyncio
async def test_all_providers_fail_raises_ai_unavailable():
    router = ProviderRouter([AlwaysFails("groq"), AlwaysFails("nvidia")], _CONFIG)
    with pytest.raises(AIUnavailableError):
        await router.generate_structured(_REQUEST, dict)


@pytest.mark.asyncio
async def test_persistently_malformed_output_raises_model_output_invalid():
    # Single provider that always returns empty structured -> repair retry -> invalid.
    router = ProviderRouter([AlwaysEmpty("groq")], _CONFIG)
    with pytest.raises(ModelOutputInvalidError):
        await router.generate_structured(_REQUEST, dict)


@pytest.mark.asyncio
async def test_invalid_output_falls_through_to_next_provider():
    router = ProviderRouter(
        [AlwaysEmpty("groq"), HealthyStructured("nvidia", {"ok": True})], _CONFIG
    )
    resp = await router.generate_structured(_REQUEST, dict)
    assert resp.metadata.provider == "nvidia"


@pytest.mark.asyncio
async def test_metadata_records_provider():
    router = ProviderRouter([HealthyStructured("groq", {"ok": True})], _CONFIG)
    resp = await router.generate_structured(_REQUEST, dict)
    assert resp.metadata.provider == "groq"
    assert resp.metadata.configuration_version == "config-v1"


@pytest.mark.asyncio
async def test_router_never_fabricates_safe_default():
    # If all fail, router must raise — never return a synthetic "safe" ModelResponse.
    router = ProviderRouter([AlwaysFails("groq")], _CONFIG)
    with pytest.raises(AIUnavailableError):
        await router.generate_structured(_REQUEST, dict)


@pytest.mark.asyncio
async def test_router_health_true_if_any_provider_healthy():
    router = ProviderRouter([AlwaysFails("groq"), HealthyStructured("nvidia", {"ok": 1})], _CONFIG)
    assert await router.health() is True
