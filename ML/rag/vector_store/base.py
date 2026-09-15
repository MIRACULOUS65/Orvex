"""VectorStore abstraction + RetrievedChunk with provenance.

Application logic depends only on ``VectorStore`` (Requirement 9.1, 9.2); Chroma /
Pinecone are interchangeable adapters. Every retrieved chunk carries provenance
(source, content_hash, ingested_at, trust_level) and is NOT trusted merely because
the store returned it (Requirement 9.3, 9.4) — the trust_level travels with it.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: str
    content: str
    score: float
    metadata: dict = field(default_factory=dict)

    @property
    def trust_level(self) -> str:
        return self.metadata.get("trust_level", "UNKNOWN")

    @property
    def source(self) -> str | None:
        return self.metadata.get("source")


class VectorStore(ABC):
    @abstractmethod
    async def upsert(
        self, ids: list[str], vectors: list[list[float]], metadatas: list[dict], documents: list[str]
    ) -> None: ...

    @abstractmethod
    async def query(
        self, vector: list[float], top_k: int, filters: dict | None = None
    ) -> list[RetrievedChunk]: ...

    @abstractmethod
    async def count(self) -> int: ...
