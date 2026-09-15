"""Hosted embedding provider — OpenAI-compatible /embeddings endpoint.

Config-gated (needs a base URL + key). Used when a real embedding model is
configured; otherwise the LocalHashingEmbeddingProvider is used. Kept behind the
same EmbeddingProvider interface so RAG code is provider-agnostic.
"""

from __future__ import annotations

import httpx

from models.embeddings.base import EmbeddingProvider
from schemas.errors import ProviderError


class HostedEmbeddingProvider(EmbeddingProvider):
    def __init__(self, *, api_key: str, base_url: str, model: str, dimension: int, timeout_s: float = 20.0):
        self.model_name = model
        self.model_version = "hosted"
        self.dimension = dimension
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._timeout_s = timeout_s

    async def embed(self, texts: list[str]) -> list[list[float]]:
        payload = {"model": self.model_name, "input": texts}
        try:
            async with httpx.AsyncClient(timeout=self._timeout_s) as client:
                resp = await client.post(
                    f"{self._base_url}/embeddings",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json=payload,
                )
        except httpx.HTTPError as exc:
            raise ProviderError("embedding transport error", details={"model": self.model_name}) from exc
        if resp.status_code >= 400:
            raise ProviderError(
                f"embedding provider HTTP {resp.status_code}",
                details={"model": self.model_name, "status": resp.status_code},
            )
        data = resp.json().get("data", [])
        return [item["embedding"] for item in data]
