"""Per-request timeout enforcement (Requirement 11.4).

Wraps request handling in an asyncio timeout so the service returns a structured
TIMEOUT error instead of hanging indefinitely.
"""

from __future__ import annotations

import asyncio

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from schemas.envelope import Envelope
from schemas.errors import Error, ErrorCode


class TimeoutMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, timeout_s: float = 60.0):
        super().__init__(app)
        self._timeout_s = timeout_s

    async def dispatch(self, request: Request, call_next):
        try:
            return await asyncio.wait_for(call_next(request), timeout=self._timeout_s)
        except asyncio.TimeoutError:
            ctx = getattr(request.state, "context", None)
            corr = getattr(ctx, "correlation_id", None) if ctx else None
            req_id = getattr(ctx, "request_id", None) if ctx else "req_unknown"
            error = Error(
                code=ErrorCode.TIMEOUT,
                message=f"Request exceeded {self._timeout_s}s timeout.",
                severity="MEDIUM",
                retryable=True,
                correlation_id=corr,
            )
            return JSONResponse(status_code=504, content=Envelope.failure(req_id, error).model_dump())
