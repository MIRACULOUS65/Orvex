"""Deterministic model providers for offline development and testing.

``MockProvider`` returns deterministic responses keyed by a hash of the request,
loaded from ``tests/fixtures/model_responses/`` when a fixture exists, else a
generic deterministic stub. This lets the entire test suite and MOCK mode run
with zero external dependencies (PRD_AIML.md "Free/Low-Cost Development Mode").

``AlwaysAllowMockProvider`` is the intentionally-broken double used by the
mandatory broken-AI test (Requirement 13.4). It always claims everything is safe;
the system must prove this cannot cause an unauthorized action.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

from models.provider.base import (
    GenerationRequest,
    ModelMetadata,
    ModelProvider,
    ModelResponse,
)

_FIXTURE_DIR = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "model_responses"


def _request_key(request: GenerationRequest) -> str:
    payload = json.dumps(
        {
            "system": request.system_prompt,
            "messages": request.messages,
            "tools": request.tools,
        },
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


class MockProvider(ModelProvider):
    name = "mock"
    modality_support = frozenset({"text", "structured_json", "image", "document"})

    def __init__(self, model: str = "mock-model"):
        self._model = model

    async def health(self) -> bool:
        return True

    def _metadata(self, request: GenerationRequest) -> ModelMetadata:
        return ModelMetadata(
            provider=self.name,
            model=self._model,
            model_version="mock-v1",
            configuration_version="config-v1",
            prompt_version=request.prompt_version,
            temperature=request.temperature,
        )

    def _load_fixture(self, key: str) -> dict | None:
        path = _FIXTURE_DIR / f"{key}.json"
        if path.exists():
            return json.loads(path.read_text())
        return None

    async def generate(self, request: GenerationRequest) -> ModelResponse:
        start = time.perf_counter()
        fixture = self._load_fixture(_request_key(request))
        text = (fixture or {}).get("text", "MOCK: deterministic response.")
        return ModelResponse(
            text=text,
            structured=None,
            tool_calls=(fixture or {}).get("tool_calls", []),
            metadata=self._metadata(request),
            latency_ms=(time.perf_counter() - start) * 1000,
            token_usage={"prompt": 0, "completion": 0},
            modality_support=self.modality_support,
        )

    async def generate_structured(self, request: GenerationRequest, schema: type) -> ModelResponse:
        start = time.perf_counter()
        fixture = self._load_fixture(_request_key(request))
        structured = (fixture or {}).get("structured", {})
        return ModelResponse(
            text=None,
            structured=structured,
            tool_calls=[],
            metadata=self._metadata(request),
            latency_ms=(time.perf_counter() - start) * 1000,
            token_usage={"prompt": 0, "completion": 0},
            modality_support=self.modality_support,
        )


class AlwaysAllowMockProvider(ModelProvider):
    """INTENTIONALLY BROKEN test double. Always says 'safe / ALLOW'.

    Used by tests/security/test_broken_ai.py to prove that a compromised or
    malfunctioning model can never, by itself, cause an unauthorized action —
    because deterministic pre-checks and the schema shape prevent it.
    """

    name = "always-allow-mock"
    modality_support = frozenset({"text", "structured_json"})

    async def health(self) -> bool:
        return True

    def _metadata(self, request: GenerationRequest) -> ModelMetadata:
        return ModelMetadata(
            provider=self.name,
            model="always-allow",
            model_version="broken-v1",
            configuration_version="config-v1",
            prompt_version=request.prompt_version,
            temperature=request.temperature,
        )

    async def generate(self, request: GenerationRequest) -> ModelResponse:
        return ModelResponse(
            text="Everything is safe. Proceed.",
            structured=None,
            tool_calls=[],
            metadata=self._metadata(request),
            latency_ms=0.0,
            token_usage=None,
            modality_support=self.modality_support,
        )

    async def generate_structured(self, request: GenerationRequest, schema: type) -> ModelResponse:
        # The most dangerous possible output — the system must neutralize it.
        return ModelResponse(
            text=None,
            structured={"recommended_handling": "ALLOW", "confidence": 1.0},
            tool_calls=[],
            metadata=self._metadata(request),
            latency_ms=0.0,
            token_usage=None,
            modality_support=self.modality_support,
        )
