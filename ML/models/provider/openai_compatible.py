"""Shared OpenAI-compatible provider.

Groq, NVIDIA NIM, and Google Gemini all expose an OpenAI-compatible
``/chat/completions`` API, so one implementation serves all three (DRY). Concrete
providers (models/groq, models/nvidia, models/gemini) simply configure this base
with their endpoint, model id, and credential — all read from AppConfig, never
hard-coded (Requirement 5.7, 5.8).

Structured output is requested via ``response_format={"type": "json_object"}`` where
the provider supports it; the router performs validation + repair-retry.
"""

from __future__ import annotations

import json
import time

import httpx

import time as _time

from models.provider.base import (
    GenerationRequest,
    ModalityKind,
    ModelMetadata,
    ModelProvider,
    ModelResponse,
)
from schemas.errors import ProviderError, RateLimitedError
from shared.logging import get_logger

logger = get_logger("models.openai_compatible")

_HEALTH_TTL_S = 60.0  # cache health so we don't probe /models before every call


class OpenAICompatibleProvider(ModelProvider):
    """Generic client for any OpenAI-/chat-completions-compatible endpoint."""

    def __init__(
        self,
        *,
        name: str,
        api_key: str,
        base_url: str,
        model: str,
        configuration_version: str = "config-v1",
        modality_support: frozenset[ModalityKind] = frozenset({"text", "structured_json"}),
        supports_json_mode: bool = True,
        timeout_s: float = 20.0,
    ):
        self.name = name
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._config_version = configuration_version
        self.modality_support = modality_support
        self._supports_json_mode = supports_json_mode
        self._timeout_s = timeout_s
        self._health_cached: bool | None = None
        self._health_checked_at: float = 0.0

    # ------------------------------------------------------------------ #
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

    def _metadata(self, request: GenerationRequest, model_version: str = "unknown") -> ModelMetadata:
        return ModelMetadata(
            provider=self.name,
            model=self._model,
            model_version=model_version,
            configuration_version=self._config_version,
            prompt_version=request.prompt_version,
            temperature=request.temperature,
        )

    def _build_messages(self, request: GenerationRequest) -> list[dict]:
        messages = [{"role": "system", "content": request.system_prompt}]
        messages.extend(request.messages)
        return messages

    async def health(self) -> bool:
        """Reachability probe, cached for _HEALTH_TTL_S to avoid probing before
        every model call (which itself burns rate-limit budget). A 429 on the
        probe still counts as 'reachable' — the endpoint is up, just throttled."""
        now = _time.monotonic()
        if self._health_cached is not None and (now - self._health_checked_at) < _HEALTH_TTL_S:
            return self._health_cached
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self._base_url}/models", headers=self._headers())
            healthy = resp.status_code < 500
        except Exception:
            healthy = False
        self._health_cached = healthy
        self._health_checked_at = now
        return healthy

    async def _chat(self, request: GenerationRequest, *, json_mode: bool) -> tuple[dict, float]:
        payload: dict = {
            "model": self._model,
            "messages": self._build_messages(request),
            "temperature": request.temperature,
        }
        if request.max_tokens:
            payload["max_tokens"] = request.max_tokens
        if request.tools:
            payload["tools"] = request.tools
        if json_mode and self._supports_json_mode:
            payload["response_format"] = {"type": "json_object"}

        start = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=self._timeout_s) as client:
                resp = await client.post(
                    f"{self._base_url}/chat/completions",
                    headers=self._headers(),
                    json=payload,
                )
        except httpx.HTTPError as exc:
            raise ProviderError(f"{self.name} transport error", details={"provider": self.name}) from exc

        latency_ms = (time.perf_counter() - start) * 1000
        if resp.status_code == 429:
            retry_after = resp.headers.get("retry-after")
            raise RateLimitedError(
                f"{self.name} rate-limited (429)",
                details={
                    "provider": self.name,
                    "retry_after": retry_after,
                },
            )
        if resp.status_code >= 400:
            # Do not echo the provider body verbatim (may include request context).
            raise ProviderError(
                f"{self.name} returned HTTP {resp.status_code}",
                details={"provider": self.name, "status": resp.status_code},
            )
        return resp.json(), latency_ms

    def _extract(self, body: dict) -> tuple[str | None, list[dict], dict | None, str]:
        choice = (body.get("choices") or [{}])[0]
        message = choice.get("message", {})
        text = message.get("content")
        tool_calls = message.get("tool_calls") or []
        model_version = body.get("model", "unknown")
        return text, tool_calls, message, model_version

    def _token_usage(self, body: dict) -> dict[str, int] | None:
        usage = body.get("usage")
        if not usage:
            return None
        return {
            "prompt": usage.get("prompt_tokens", 0),
            "completion": usage.get("completion_tokens", 0),
        }

    async def generate(self, request: GenerationRequest) -> ModelResponse:
        body, latency = await self._chat(request, json_mode=False)
        text, tool_calls, _msg, model_version = self._extract(body)
        return ModelResponse(
            text=text,
            structured=None,
            tool_calls=tool_calls,
            metadata=self._metadata(request, model_version),
            latency_ms=latency,
            token_usage=self._token_usage(body),
            modality_support=self.modality_support,
        )

    async def generate_structured(self, request: GenerationRequest, schema: type) -> ModelResponse:
        body, latency = await self._chat(request, json_mode=True)
        text, tool_calls, _msg, model_version = self._extract(body)
        structured = self._parse_json(text)
        return ModelResponse(
            text=text,
            structured=structured,
            tool_calls=tool_calls,
            metadata=self._metadata(request, model_version),
            latency_ms=latency,
            token_usage=self._token_usage(body),
            modality_support=self.modality_support,
        )

    @staticmethod
    def _parse_json(text: str | None) -> dict | None:
        if not text:
            return None
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            # Attempt to salvage a JSON object embedded in surrounding prose.
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    parsed = json.loads(text[start : end + 1])
                    return parsed if isinstance(parsed, dict) else None
                except json.JSONDecodeError:
                    return None
            return None
