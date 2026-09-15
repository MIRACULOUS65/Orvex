"""Embedding provider abstraction.

Business logic depends only on ``EmbeddingProvider``; the concrete backend (local
hashing model, hosted API, future) is selected by config. Embedding metadata
(model/version/dimension/chunking/doc hash/timestamp) is recorded so retrieval is
reproducible (Requirement 9.6). Dimension is a provider property — never hard-coded
into business logic (Requirement 9.7).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class EmbeddingMetadata:
    model_name: str
    model_version: str
    dimension: int
    chunking_config: dict
    document_hash: str
    ingested_at: str


class EmbeddingProvider(ABC):
    model_name: str = "abstract"
    dimension: int = 0

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Return one embedding vector per input text."""
