"""NVIDIA NIM provider (fallback 1). OpenAI-compatible via integrate.api.nvidia.com.

Large free hosted catalog. Model id + endpoint come from AppConfig.
"""

from __future__ import annotations

from models.provider.openai_compatible import OpenAICompatibleProvider


class NvidiaProvider(OpenAICompatibleProvider):
    def __init__(self, *, api_key: str, base_url: str, model: str, timeout_s: float = 20.0):
        super().__init__(
            name="nvidia",
            api_key=api_key,
            base_url=base_url,
            model=model,
            modality_support=frozenset({"text", "structured_json"}),
            supports_json_mode=True,
            timeout_s=timeout_s,
        )
