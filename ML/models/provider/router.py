"""ProviderRouter — the only thing business logic depends on for model calls.

Implements the primary -> fallback -> second-fallback chain with:
- bounded retry per provider (config.model_max_retries),
- exactly one repair retry when structured output fails validation,
- fail-closed behavior: all providers exhausted -> AIUnavailableError;
  repair retry still invalid -> ModelOutputInvalidError.

It NEVER substitutes a default "safe" result on failure (Requirement 5.4, 5.5).
"""

from __future__ import annotations

import asyncio

from config.settings import AppConfig
from models.provider.base import GenerationRequest, ModelProvider, ModelResponse
from schemas.errors import AIUnavailableError, ModelOutputInvalidError, RateLimitedError
from shared.logging import get_logger
from shared.tracing import span

logger = get_logger("models.router")


class ProviderRouter:
    """Routes generation calls across an ordered list of providers."""

    # A provider that returns 429 is briefly deprioritized so we don't hammer it,
    # but the window is short so a fast primary (Groq) is retried within a run.
    _RATE_LIMIT_COOLDOWN_S = 8.0

    def __init__(self, providers: list[ModelProvider], config: AppConfig):
        if not providers:
            raise ValueError("ProviderRouter requires at least one provider.")
        self._providers = providers
        self._config = config
        self._cooldown_until: dict[str, float] = {}

    @property
    def providers(self) -> list[ModelProvider]:
        return list(self._providers)

    async def health(self) -> bool:
        """Router is healthy if at least one provider passes its health check."""
        for provider in self._providers:
            try:
                if await asyncio.wait_for(provider.health(), timeout=5.0):
                    return True
            except Exception:
                continue
        return False

    def _on_cooldown(self, name: str) -> bool:
        import time as _t

        return self._cooldown_until.get(name, 0.0) > _t.monotonic()

    def _start_cooldown(self, name: str) -> None:
        import time as _t

        self._cooldown_until[name] = _t.monotonic() + self._RATE_LIMIT_COOLDOWN_S
        logger.info("provider on rate-limit cooldown", extra={"provider": name})

    async def _ordered_by_health(self) -> list[ModelProvider]:
        """Order: healthy-and-available first, then cooled-down, then unhealthy.

        Health is cached inside each provider (TTL), so this does not probe the
        network on every call. Rate-limited providers are pushed back so a burst
        goes straight to a working provider instead of re-hitting a 429.
        """
        available: list[ModelProvider] = []
        cooling: list[ModelProvider] = []
        unhealthy: list[ModelProvider] = []
        for p in self._providers:
            try:
                ok = await asyncio.wait_for(p.health(), timeout=5.0)
            except Exception:
                ok = False
            if not ok:
                unhealthy.append(p)
            elif self._on_cooldown(p.name):
                cooling.append(p)
            else:
                available.append(p)
        return available + cooling + unhealthy

    # ------------------------------------------------------------------ #
    async def generate(self, request: GenerationRequest) -> ModelResponse:
        return await self._run(request, schema=None)

    async def generate_structured(
        self, request: GenerationRequest, schema: type
    ) -> ModelResponse:
        return await self._run(request, schema=schema)

    async def _run(self, request: GenerationRequest, schema: type | None) -> ModelResponse:
        last_error: Exception | None = None
        fallback_used = False

        for index, provider in enumerate(await self._ordered_by_health()):
            fallback_used = index > 0
            try:
                with span(
                    "model.invoke",
                    {"provider": provider.name, "fallback_used": fallback_used},
                ):
                    return await self._call_provider_with_retries(provider, request, schema)
            except ModelOutputInvalidError:
                # A structurally invalid output after repair is a provider-quality
                # problem; try the next provider rather than trusting bad output.
                logger.warning("model output invalid; trying next provider", extra={"provider": provider.name})
                last_error = ModelOutputInvalidError(provider=provider.name)
                continue
            except RateLimitedError as exc:
                # Put the throttled provider on cooldown so the rest of this burst
                # skips it, then fall through to the next provider.
                self._start_cooldown(provider.name)
                last_error = exc
                continue
            except Exception as exc:  # transport/timeout/provider error -> next provider
                logger.warning("provider failed; falling back", extra={"provider": provider.name})
                last_error = exc
                continue

        # Every provider exhausted. Fail closed — never fabricate a safe result.
        if isinstance(last_error, ModelOutputInvalidError):
            raise last_error
        raise AIUnavailableError(cause=last_error)

    async def _call_provider_with_retries(
        self, provider: ModelProvider, request: GenerationRequest, schema: type | None
    ) -> ModelResponse:
        attempts = self._config.model_max_retries + 1
        transient_error: Exception | None = None

        for attempt in range(attempts):
            try:
                if schema is None:
                    return await asyncio.wait_for(
                        provider.generate(request), timeout=self._config.model_timeout_s
                    )
                response = await asyncio.wait_for(
                    provider.generate_structured(request, schema),
                    timeout=self._config.model_timeout_s,
                )
            except RateLimitedError:
                # Do NOT hammer a throttled provider with retries — that only makes
                # rate limiting worse. Fall through to the next provider immediately.
                raise
            except (asyncio.TimeoutError, Exception) as exc:  # noqa: BLE001
                transient_error = exc
                if attempt < attempts - 1:
                    await asyncio.sleep(min(2**attempt * 0.2, 2.0))  # bounded backoff
                    continue
                raise

            # Structured validation + one repair retry (Requirement 5.5).
            if self._is_valid(response, schema):
                return response
            if attempt < attempts - 1:
                request = self._augment_with_repair_hint(request, response)
                continue
            raise ModelOutputInvalidError(provider=provider.name)

        # Unreachable, but keep the type checker happy / fail closed.
        raise transient_error or ModelOutputInvalidError(provider=provider.name)

    @staticmethod
    def _is_valid(response: ModelResponse, schema: type | None) -> bool:
        if schema is None:
            return response.text is not None
        # We require a non-empty structured dict; the caller (parser/verifier)
        # performs full schema-shaped validation with its own Pydantic model.
        return isinstance(response.structured, dict) and len(response.structured) > 0

    @staticmethod
    def _augment_with_repair_hint(
        request: GenerationRequest, response: ModelResponse
    ) -> GenerationRequest:
        repair = (
            "\n\nYOUR PREVIOUS RESPONSE WAS NOT VALID STRUCTURED JSON. "
            "Return ONLY a single valid JSON object with the required fields."
        )
        return GenerationRequest(
            system_prompt=request.system_prompt + repair,
            messages=request.messages,
            input_parts=request.input_parts,
            tools=request.tools,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            prompt_version=request.prompt_version,
        )
