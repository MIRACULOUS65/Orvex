"""RAG routes: POST /rag/ingest, POST /rag/retrieve.

Lets the backend/frontend index knowledge (policy docs, provider info) and retrieve
it with provenance. Retrieval returns `grounded=false` when nothing relevant is
found — the explicit anti-hallucination signal.
"""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from config.settings import AppConfig, get_config
from gateway.middleware.correlation import RequestContext, correlation_context
from rag.factory import build_ingestion, build_retriever
from rag.ingestion.pipeline import RawDocument
from schemas.envelope import Envelope, Metadata

router = APIRouter(tags=["rag"])


class IngestRequest(BaseModel):
    source: str
    content: str = Field(min_length=1)
    trust_level: str = "UNTRUSTED"
    page: int | None = None
    doc_type: str = "TEXT"
    collection: str = "sentinelpay"


class IngestResult(BaseModel):
    document_id: str
    document_hash: str
    chunk_count: int


class RetrieveRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = 5
    collection: str = "sentinelpay"


class RetrievedItem(BaseModel):
    content: str
    score: float
    source: str | None = None
    trust_level: str = "UNKNOWN"


class RetrieveResult(BaseModel):
    query: str
    grounded: bool
    items: list[RetrievedItem]


def _config() -> AppConfig:
    return get_config()


@router.post("/rag/ingest", response_model=Envelope[IngestResult])
async def ingest(
    req: IngestRequest,
    ctx: RequestContext = Depends(correlation_context),
    config: AppConfig = Depends(_config),
) -> Envelope[IngestResult]:
    start = time.perf_counter()
    pipeline = build_ingestion(config, collection=req.collection)
    result = await pipeline.ingest(
        RawDocument(
            source=req.source,
            content=req.content,
            trust_level=req.trust_level,
            page=req.page,
            doc_type=req.doc_type,
        )
    )
    data = IngestResult(
        document_id=result.document_id,
        document_hash=result.document_hash,
        chunk_count=result.chunk_count,
    )
    return Envelope(
        request_id=ctx.request_id,
        status="OK",
        data=data,
        metadata=Metadata(latency_ms=(time.perf_counter() - start) * 1000),
    )


@router.post("/rag/retrieve", response_model=Envelope[RetrieveResult])
async def retrieve(
    req: RetrieveRequest,
    ctx: RequestContext = Depends(correlation_context),
    config: AppConfig = Depends(_config),
) -> Envelope[RetrieveResult]:
    start = time.perf_counter()
    retriever = build_retriever(config, collection=req.collection)
    result = await retriever.retrieve(req.query, top_k=req.top_k)
    data = RetrieveResult(
        query=req.query,
        grounded=result.grounded,
        items=[
            RetrievedItem(content=c.content, score=c.score, source=c.source, trust_level=c.trust_level)
            for c in result.chunks
        ],
    )
    status = "OK" if result.grounded else "INSUFFICIENT_EVIDENCE"
    return Envelope(
        request_id=ctx.request_id,
        status=status,
        data=data,
        metadata=Metadata(latency_ms=(time.perf_counter() - start) * 1000),
    )
