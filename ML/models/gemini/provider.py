"""Google Gemini provider (fallback 2 — last resort).

Uses Gemini's OpenAI-compatible endpoint
(https://generativelanguage.googleapis.com/v1beta/openai). Default model
gemini-2.5-flash-lite (low-latency, cost-efficient). Gemini supports multimodal
image input, reflected in modality_support.
"""

from __future__ import annotations

from models.provider.openai_compatible import OpenAICompatibleProvider


class GeminiProvider(OpenAICompatibleProvider):
    def __init__(self, *, api_key: str, base_url: str, model: str, timeout_s: float = 20.0):
        super().__init__(
            name="gemini",
            api_key=api_key,
            base_url=base_url,
            model=model,
            modality_support=frozenset({"text", "structured_json", "image"}),
            supports_json_mode=True,
            timeout_s=timeout_s,
        )
