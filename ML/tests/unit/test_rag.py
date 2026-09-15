"""RAG tests (Requirements 9.3, 9.4, 9.5) — provenance, untrusted-by-default, grounding.

Uses an in-memory fake vector store so tests are fast and offline (no Chroma disk).
"""

from __future__ import annotations

import pytest

from models.embeddings.local import LocalHashingEmbeddingProvider
from rag.ingestion.pipeline import IngestionPipeline, RawDocument
from rag.retrieval.retriever import Retriever
from rag.vector_store.base import RetrievedChunk, VectorStore


class InMemoryStore(VectorStore):
    def __init__(self):
        self._items: list[dict] = []

    async def upsert(self, ids, vectors, metadatas, documents):
        for i in range(len(ids)):
            self._items.append(
                {"id": ids[i], "vec": vectors[i], "meta": metadatas[i], "doc": documents[i]}
            )

    async def query(self, vector, top_k, filters=None):
        def cos(a, b):
            return sum(x * y for x, y in zip(a, b))

        scored = sorted(self._items, key=lambda it: cos(vector, it["vec"]), reverse=True)
        return [
            RetrievedChunk(chunk_id=it["id"], content=it["doc"], score=cos(vector, it["vec"]), metadata=it["meta"])
            for it in scored[:top_k]
        ]

    async def count(self):
        return len(self._items)


def _rag():
    embedder = LocalHashingEmbeddingProvider()
    store = InMemoryStore()
    return embedder, store


@pytest.mark.asyncio
async def test_ingested_chunk_carries_provenance_and_untrusted_default():
    embedder, store = _rag()
    pipeline = IngestionPipeline(embedder=embedder, store=store)
    result = await pipeline.ingest(
        RawDocument(source="https://ex.com/pricing", content="ExampleData market data API costs 4.20 USDC per day.")
    )
    assert result.chunk_count >= 1
    retriever = Retriever(embedder=embedder, store=store, min_score=0.0)
    r = await retriever.retrieve("market data API price")
    assert r.chunks
    top = r.chunks[0]
    assert top.metadata["source"] == "https://ex.com/pricing"
    assert top.trust_level == "UNTRUSTED"  # default for imported content
    assert top.metadata["content_hash"].startswith("sha256:")


@pytest.mark.asyncio
async def test_retrieval_not_grounded_when_nothing_relevant():
    embedder, store = _rag()
    retriever = Retriever(embedder=embedder, store=store, min_score=0.5)
    # Empty store -> no chunks -> not grounded (anti-hallucination signal).
    r = await retriever.retrieve("anything")
    assert r.grounded is False
    assert r.chunks == []


@pytest.mark.asyncio
async def test_ingestion_rejects_empty_document():
    embedder, store = _rag()
    pipeline = IngestionPipeline(embedder=embedder, store=store)
    with pytest.raises(ValueError):
        await pipeline.ingest(RawDocument(source="x", content="   "))


@pytest.mark.asyncio
async def test_ingestion_sanitizes_control_chars():
    embedder, store = _rag()
    pipeline = IngestionPipeline(embedder=embedder, store=store)
    result = await pipeline.ingest(RawDocument(source="x", content="hello\x00\x07world data"))
    assert result.chunk_count >= 1
    retriever = Retriever(embedder=embedder, store=store, min_score=0.0)
    r = await retriever.retrieve("hello world")
    assert "\x00" not in r.chunks[0].content


@pytest.mark.asyncio
async def test_embedding_is_deterministic():
    embedder = LocalHashingEmbeddingProvider()
    a = await embedder.embed(["market data api"])
    b = await embedder.embed(["market data api"])
    assert a == b  # same text -> same vector (reproducible RAG, no drift)


@pytest.mark.asyncio
async def test_retrieval_tool_reports_grounding():
    from memory.short_term.session_state import ExecutionContext
    from tools.retrieval.retrieval_tool import RetrievalInput, RetrievalTool

    embedder, store = _rag()
    pipeline = IngestionPipeline(embedder=embedder, store=store)
    await pipeline.ingest(RawDocument(source="s", content="USDC payments via x402 are supported."))
    tool = RetrievalTool(Retriever(embedder=embedder, store=store, min_score=0.0))
    result = await tool.run(RetrievalInput(query="x402 usdc"), context=ExecutionContext("e", "a"))
    assert result.output.grounded is True
    assert result.output.items[0].trust_level == "UNTRUSTED"
