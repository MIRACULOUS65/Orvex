"""WebFetchTool — fetches a URL's text. ALL fetched content is UNTRUSTED.

This is the tool through which indirect prompt injection / payment redirection
enters the trajectory (SECURITY_MODEL.md §11, §57). Every result is tagged
trust_level=UNTRUSTED / source_type=WEBPAGE so downstream threat detection and
intent verification treat it as data, never authority.
"""

from __future__ import annotations

import hashlib
import time

import httpx
from pydantic import BaseModel

from memory.short_term.session_state import ExecutionContext
from tools.base import PermissionLevel, Tool, ToolResult, ToolSpec, TrustLevel

_MAX_CHARS = 8000


class WebFetchInput(BaseModel):
    url: str


class WebFetchOutput(BaseModel):
    url: str
    content: str
    truncated: bool


class WebFetchTool(Tool):
    spec = ToolSpec(
        name="web_fetch",
        description="Fetch the text content of a URL. Returned content is UNTRUSTED.",
        input_schema=WebFetchInput,
        output_schema=WebFetchOutput,
        permission_level=PermissionLevel.READ_ONLY,
        default_trust_level=TrustLevel.UNTRUSTED,
        timeout_s=15.0,
        max_retries=1,
    )

    async def run(self, input: BaseModel, *, context: ExecutionContext) -> ToolResult:
        start = time.perf_counter()
        assert isinstance(input, WebFetchInput)
        async with httpx.AsyncClient(timeout=self.spec.timeout_s, follow_redirects=True) as client:
            resp = await client.get(input.url)
        text = resp.text or ""
        truncated = len(text) > _MAX_CHARS
        content = text[:_MAX_CHARS]
        output = WebFetchOutput(url=input.url, content=content, truncated=truncated)
        return ToolResult(
            output=output,
            trust_level=TrustLevel.UNTRUSTED,  # ALWAYS untrusted
            source_type="WEBPAGE",
            content_hash="sha256:" + hashlib.sha256(content.encode()).hexdigest(),
            latency_ms=(time.perf_counter() - start) * 1000,
        )
