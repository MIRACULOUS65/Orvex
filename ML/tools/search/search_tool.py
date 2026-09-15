"""SearchTool — web/provider search behind a pluggable SearchProvider.

Search results are UNTRUSTED external data (API.md §8). In the absence of a
configured provider key, the tool operates in an injectable mode: the caller may
supply canned results (used by the demo/tests and to make offline runs work),
but they remain trust_level=UNTRUSTED regardless of source.
"""

from __future__ import annotations

import hashlib
import time
from collections.abc import Awaitable, Callable

from pydantic import BaseModel

from memory.short_term.session_state import ExecutionContext
from tools.base import PermissionLevel, Tool, ToolResult, ToolSpec, TrustLevel


class SearchInput(BaseModel):
    query: str
    max_results: int = 5


class SearchResult(BaseModel):
    title: str
    url: str
    snippet: str


class SearchOutput(BaseModel):
    query: str
    results: list[SearchResult]


# A search backend: async (query, max_results) -> list[SearchResult].
SearchBackend = Callable[[str, int], Awaitable[list[SearchResult]]]


async def _empty_backend(query: str, max_results: int) -> list[SearchResult]:
    return []


class SearchTool(Tool):
    spec = ToolSpec(
        name="search",
        description="Search the web for providers/information. Results are UNTRUSTED.",
        input_schema=SearchInput,
        output_schema=SearchOutput,
        permission_level=PermissionLevel.READ_ONLY,
        default_trust_level=TrustLevel.UNTRUSTED,
        timeout_s=15.0,
        max_retries=1,
    )

    def __init__(self, backend: SearchBackend | None = None):
        self._backend = backend or _empty_backend

    async def run(self, input: BaseModel, *, context: ExecutionContext) -> ToolResult:
        start = time.perf_counter()
        assert isinstance(input, SearchInput)
        results = await self._backend(input.query, input.max_results)
        output = SearchOutput(query=input.query, results=results)
        digest = hashlib.sha256(output.model_dump_json().encode()).hexdigest()
        return ToolResult(
            output=output,
            trust_level=TrustLevel.UNTRUSTED,
            source_type="SEARCH",
            content_hash="sha256:" + digest,
            latency_ms=(time.perf_counter() - start) * 1000,
        )
