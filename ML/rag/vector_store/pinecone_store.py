"""PineconeStore — managed vector store adapter (config-gated, optional).

Interface-complete but only usable when Pinecone credentials are configured. Chroma
is the required V1 backend; this exists so production can swap stores without
touching RAG logic (Requirement 9.1/9.2). Import of the pinecone client is lazy so
the dependency is optional.
"""

from __future__ import annotations

from rag.vector_store.base import RetrievedChunk, VectorStore


class PineconeStore(VectorStore):
    def __init__(self, *, api_key: str, index: str):
        try:
            from pinecone import Pinecone
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "PineconeStore requires the 'pinecone-client' optional dependency."
            ) from exc
        self._pc = Pinecone(api_key=api_key)
        self._index = self._pc.Index(index)

    async def upsert(
        self, ids: list[str], vectors: list[list[float]], metadatas: list[dict], documents: list[str]
    ) -> None:
        items = [
            {"id": ids[i], "values": vectors[i], "metadata": {**metadatas[i], "document": documents[i]}}
            for i in range(len(ids))
        ]
        self._index.upsert(vectors=items)

    async def query(
        self, vector: list[float], top_k: int, filters: dict | None = None
    ) -> list[RetrievedChunk]:
        res = self._index.query(vector=vector, top_k=top_k, include_metadata=True, filter=filters)
        chunks: list[RetrievedChunk] = []
        for m in res.get("matches", []):
            meta = m.get("metadata", {}) or {}
            chunks.append(
                RetrievedChunk(
                    chunk_id=m.get("id"),
                    content=meta.get("document", ""),
                    score=float(m.get("score", 0.0)),
                    metadata={k: v for k, v in meta.items() if k != "document"},
                )
            )
        return chunks

    async def count(self) -> int:
        stats = self._index.describe_index_stats()
        return int(stats.get("total_vector_count", 0))
