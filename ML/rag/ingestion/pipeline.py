"""Document ingestion pipeline.

Flow (Requirement 9.5, PRD_AIML "Document/Data Ingestion"):
  document -> validate -> sanitize -> chunk -> embed -> store (with provenance)

ALL ingested content is treated as untrusted (sanitize strips nothing semantic but
records provenance + a default trust_level). Every chunk carries source, page,
content_hash, ingested_at, trust_level so retrieval is explainable and never
becomes trusted merely by being stored/returned.
"""

from __future__ import annotations

import hashlib
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from models.embeddings.base import EmbeddingProvider
from rag.chunking.chunkers import chunk_text
from rag.vector_store.base import VectorStore
from shared.logging import get_logger

logger = get_logger("rag.ingestion")

# Control characters / null bytes stripped during sanitize.
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


@dataclass(frozen=True)
class RawDocument:
    source: str
    content: str
    trust_level: str = "UNTRUSTED"  # default: imported content is untrusted
    page: int | None = None
    doc_type: str = "TEXT"


@dataclass(frozen=True)
class IngestionResult:
    document_id: str
    document_hash: str
    chunk_count: int


class IngestionPipeline:
    def __init__(self, *, embedder: EmbeddingProvider, store: VectorStore, chunk_size: int = 800, overlap: int = 120):
        self._embedder = embedder
        self._store = store
        self._chunk_size = chunk_size
        self._overlap = overlap

    def _sanitize(self, text: str) -> str:
        return _CONTROL_RE.sub("", text or "")

    async def ingest(self, document: RawDocument) -> IngestionResult:
        if not document.content or not document.content.strip():
            raise ValueError("Cannot ingest empty document.")

        sanitized = self._sanitize(document.content)
        doc_hash = "sha256:" + hashlib.sha256(sanitized.encode()).hexdigest()
        document_id = f"doc_{uuid.uuid4().hex[:12]}"
        ingested_at = datetime.now(timezone.utc).isoformat()

        base_meta = {
            "source": document.source,
            "trust_level": document.trust_level,
            "document_id": document_id,
            "document_hash": doc_hash,
            "ingested_at": ingested_at,
            "doc_type": document.doc_type,
        }
        if document.page is not None:
            base_meta["page"] = document.page

        chunks = chunk_text(
            sanitized, chunk_size=self._chunk_size, overlap=self._overlap, base_metadata=base_meta
        )
        if not chunks:
            return IngestionResult(document_id=document_id, document_hash=doc_hash, chunk_count=0)

        texts = [c.text for c in chunks]
        vectors = await self._embedder.embed(texts)
        ids = [f"{document_id}_chunk_{c.index}" for c in chunks]
        metadatas = [
            {**c.metadata, "chunk_index": c.index, "content_hash": "sha256:" + hashlib.sha256(c.text.encode()).hexdigest()}
            for c in chunks
        ]
        await self._store.upsert(ids=ids, vectors=vectors, metadatas=metadatas, documents=texts)
        logger.info("ingested document", extra={"document_id": document_id, "chunks": len(chunks)})
        return IngestionResult(document_id=document_id, document_hash=doc_hash, chunk_count=len(chunks))
