"""Provenance-aware retriever.

Embeds the query, queries the vector store, and returns chunks that ALWAYS carry
their provenance + trust_level. A retrieved chunk is never elevated to 'trusted'
just because it matched (Requirement 9.4). Includes a minimum-score floor so
weak/irrelevant matches are dropped rather than fed to a model as if relevant —
this is a key anti-hallucination guard.
"""

from __future__ import annotations

from dataclasses import dataclass

from models.embeddings.base import EmbeddingProvider
from rag.vector_store.base import RetrievedChunk, VectorStore


@dataclass(frozen=True)
class RetrievalResult:
    query: str
    chunks: list[RetrievedChunk]
    grounded: bool  # True if any chunk cleared the relevance floor


class Retriever:
    def __init__(self, *, embedder: EmbeddingProvider, store: VectorStore, min_score: float = 0.15):
        self._embedder = embedder
        self._store = store
        self._min_score = min_score

    async def retrieve(self, query: str, *, top_k: int = 5, filters: dict | None = None) -> RetrievalResult:
        vectors = await self._embedder.embed([query])
        chunks = await self._store.query(vectors[0], top_k=top_k, filters=filters)
        relevant = [c for c in chunks if c.score >= self._min_score]
        return RetrievalResult(query=query, chunks=relevant, grounded=bool(relevant))
