"""Groq provider (primary). Free, ultra-fast LPU inference. OpenAI-compatible.

Default model: openai/gpt-oss-20b (Groq's fastest current free model; the older
llama-3.1-8b-instant / llama-3.3-70b-versatile ids were deprecated mid-2026).
Model id and endpoint come from AppConfig — never hard-coded here.
"""

from __future__ import annotations

from models.provider.openai_compatible import OpenAICompatibleProvider


class GroqProvider(OpenAICompatibleProvider):
    def __init__(self, *, api_key: str, base_url: str, model: str, timeout_s: float = 20.0):
        super().__init__(
            name="groq",
            api_key=api_key,
            base_url=base_url,
            model=model,
            modality_support=frozenset({"text", "structured_json"}),
            supports_json_mode=True,
            timeout_s=timeout_s,
        )
