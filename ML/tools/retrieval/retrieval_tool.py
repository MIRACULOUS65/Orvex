"""RetrievalTool — RAG retrieval as an agent tool, with provenance.

Wraps the Retriever. Retrieved chunks are returned with their stored trust_level
and source; a retrieved chunk is NEVER auto-elevated to trusted. If nothing clears
the relevance floor, `grounded=False` is returned so the agent/security layer knows
the answer is not supported by indexed evidence (anti-hallucination signal).
"""

from __future__ import annotations

import hashlib

from pydantic import BaseModel, Field

from memory.short_term.session_state import ExecutionContext
from rag.retrieval.retriever import Retriever
from tools.base import PermissionLevel, Tool, ToolResult, ToolSpec, TrustLevel


class RetrievalInput(BaseModel):
    query: str
    top_k: int = 5


class RetrievedItem(BaseModel):
    content: str
    score: float
    source: str | None = None
    trust_level: str = "UNKNOWN"


class RetrievalOutput(BaseModel):
    query: str
    grounded: bool
    items: list[RetrievedItem] = Field(default_factory=list)


class RetrievalTool(Tool):
    spec = ToolSpec(
        name="retrieval",
        description="Retrieve relevant indexed knowledge with provenance. Results are not authoritative.",
        input_schema=RetrievalInput,
        output_schema=RetrievalOutput,
        permission_level=PermissionLevel.READ_ONLY,
        default_trust_level=TrustLevel.INTERNAL,
        timeout_s=10.0,
        max_retries=1,
    )

    def __init__(self, retriever: Retriever):
        self._retriever = retriever

    async def run(self, input: BaseModel, *, context: ExecutionContext) -> ToolResult:
        assert isinstance(input, RetrievalInput)
        result = await self._retriever.retrieve(input.query, top_k=input.top_k)
        items = [
            RetrievedItem(
                content=c.content, score=c.score, source=c.source, trust_level=c.trust_level
            )
            for c in result.chunks
        ]
        output = RetrievalOutput(query=input.query, grounded=result.grounded, items=items)
        digest = hashlib.sha256(output.model_dump_json().encode()).hexdigest()
        return ToolResult(
            output=output,
            trust_level=TrustLevel.INTERNAL,  # the retrieval act is internal; item trust travels per-item
            source_type="RETRIEVAL",
            content_hash="sha256:" + digest,
            latency_ms=0.0,
        )
