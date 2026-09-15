"""ChromaStore — persistent local vector store (default V1 backend).

We supply our own embeddings (embedding_function=None) so the store is agnostic to
the embedding provider. Distances are converted to a similarity score in [0,1].
"""

from __future__ import annotations

from rag.vector_store.base import RetrievedChunk, VectorStore
from shared.logging import get_logger

logger = get_logger("rag.chroma")


class ChromaStore(VectorStore):
    def __init__(self, path: str = "./.chroma", collection: str = "sentinelpay"):
        import chromadb

        self._client = chromadb.PersistentClient(path=path)
        self._collection = self._client.get_or_create_collection(
            name=collection, metadata={"hnsw:space": "cosine"}
        )

    async def upsert(
        self, ids: list[str], vectors: list[list[float]], metadatas: list[dict], documents: list[str]
    ) -> None:
        if not ids:
            return
        # Chroma requires non-empty scalar metadata values; sanitize.
        clean = [{k: v for k, v in m.items() if isinstance(v, (str, int, float, bool))} for m in metadatas]
        self._collection.upsert(ids=ids, embeddings=vectors, metadatas=clean, documents=documents)

    async def query(
        self, vector: list[float], top_k: int, filters: dict | None = None
    ) -> list[RetrievedChunk]:
        result = self._collection.query(
            query_embeddings=[vector],
            n_results=top_k,
            where=filters or None,
            include=["documents", "metadatas", "distances"],
        )
        ids = (result.get("ids") or [[]])[0]
        docs = (result.get("documents") or [[]])[0]
        metas = (result.get("metadatas") or [[]])[0]
        dists = (result.get("distances") or [[]])[0]

        chunks: list[RetrievedChunk] = []
        for i, cid in enumerate(ids):
            distance = dists[i] if i < len(dists) else 1.0
            score = max(0.0, 1.0 - float(distance))  # cosine distance -> similarity
            chunks.append(
                RetrievedChunk(
                    chunk_id=cid,
                    content=docs[i] if i < len(docs) else "",
                    score=round(score, 4),
                    metadata=metas[i] if i < len(metas) else {},
                )
            )
        return chunks

    async def count(self) -> int:
        return self._collection.count()
