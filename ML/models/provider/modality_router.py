"""ModalityRouter — routes multimodal input to a capable provider.

Requirement 6.2/6.3: if a provider can't handle a modality, route to one that can,
preprocess it, or return an explicit UNSUPPORTED_MODALITY status. NEVER silently
drop a part that could carry security-relevant content.
"""

from __future__ import annotations

from dataclasses import dataclass

from models.provider.base import InputPart, ModalityKind, ModelProvider


@dataclass(frozen=True)
class RoutingDecision:
    provider: ModelProvider | None
    unsupported_kinds: list[ModalityKind]
    supported: bool


class ModalityRouter:
    def __init__(self, providers: list[ModelProvider]):
        self._providers = providers

    def route(self, parts: list[InputPart]) -> RoutingDecision:
        required: set[ModalityKind] = {p.kind for p in parts} or {"text"}
        # Find a single provider that covers every required modality.
        for provider in self._providers:
            if required <= provider.modality_support:
                return RoutingDecision(provider=provider, unsupported_kinds=[], supported=True)
        # No single provider covers everything — report what is unsupported.
        best = max(self._providers, key=lambda p: len(required & p.modality_support), default=None)
        covered = best.modality_support if best else set()
        unsupported = sorted(required - covered)
        return RoutingDecision(provider=best, unsupported_kinds=list(unsupported), supported=not unsupported)
