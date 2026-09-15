"""Model provider abstraction.

Business logic depends ONLY on ``ModelProvider`` (and, in Phase 3, ``ProviderRouter``)
— never on a concrete provider class. This keeps the model layer replaceable
(TECH_STACK.md §35, SDK_SPEC.md §51) and ensures no provider SDK call or credential
leaks into the rest of the codebase.

Also defines the normalized multimodal ``InputPart`` (design §B16) so the provider
layer can decide which modalities a given backend supports.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Literal

ModalityKind = Literal["text", "image", "document", "audio", "structured_json"]


@dataclass(frozen=True)
class InputPart:
    """One piece of (possibly multimodal) input. Carries provenance."""

    kind: ModalityKind
    content: Any  # str | bytes | dict depending on kind
    mime_type: str | None = None
    source_ref: str | None = None


@dataclass(frozen=True)
class ModelMetadata:
    """Reproducibility metadata attached to every AI result (CONTRACTS.md §43)."""

    provider: str
    model: str
    model_version: str
    configuration_version: str
    prompt_version: str
    temperature: float
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return {
            "provider": self.provider,
            "model": self.model,
            "model_version": self.model_version,
            "configuration_version": self.configuration_version,
            "prompt_version": self.prompt_version,
            "temperature": self.temperature,
            "timestamp": self.timestamp,
        }


@dataclass(frozen=True)
class GenerationRequest:
    """Provider-agnostic generation request."""

    system_prompt: str
    messages: list[dict]
    input_parts: tuple[InputPart, ...] = ()
    tools: list[dict] | None = None
    temperature: float = 0.0
    max_tokens: int | None = None
    prompt_version: str = "v1"


@dataclass(frozen=True)
class ModelResponse:
    """Normalized model output across providers."""

    text: str | None
    structured: dict | None
    tool_calls: list[dict]
    metadata: ModelMetadata
    latency_ms: float
    token_usage: dict[str, int] | None
    modality_support: frozenset[ModalityKind]


class ModelProvider(ABC):
    """One concrete LLM backend."""

    name: str = "abstract"
    modality_support: frozenset[ModalityKind] = frozenset({"text", "structured_json"})

    @abstractmethod
    async def health(self) -> bool:
        """Return True if the provider is reachable/usable right now."""

    @abstractmethod
    async def generate(self, request: GenerationRequest) -> ModelResponse:
        """Free-form generation."""

    @abstractmethod
    async def generate_structured(
        self, request: GenerationRequest, schema: type
    ) -> ModelResponse:
        """Structured/JSON-mode generation intended to validate against ``schema``."""

    async def stream(self, request: GenerationRequest) -> AsyncIterator[str]:  # optional
        raise NotImplementedError
        yield  # pragma: no cover
