"""Global exception handling.

Maps every exception to exactly one machine-readable Error code and wraps it in
the standard Envelope. No raw traceback ever reaches the client (SECURITY_MODEL.md
§61 — avoid leaking internal state/secrets). Requirement 11.2.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from schemas.envelope import Envelope
from schemas.errors import (
    AIServiceError,
    Error,
    ErrorCode,
)
from shared.logging import get_logger

logger = get_logger("gateway.errors")


def _correlation_id(request: Request) -> str | None:
    ctx = getattr(request.state, "context", None)
    return getattr(ctx, "correlation_id", None) if ctx else None


def _request_id(request: Request) -> str:
    ctx = getattr(request.state, "context", None)
    return getattr(ctx, "request_id", None) if ctx else "req_unknown"


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AIServiceError)
    async def handle_service_error(request: Request, exc: AIServiceError):
        corr = _correlation_id(request)
        error = exc.to_error(correlation_id=corr)
        logger.warning(
            "handled service error",
            extra={"code": error.code.value, "correlation_id": corr},
        )
        status = "INSUFFICIENT_EVIDENCE" if error.code == ErrorCode.INSUFFICIENT_EVIDENCE else "ERROR"
        envelope = Envelope.failure(_request_id(request), error, status=status)
        return JSONResponse(status_code=exc.http_status, content=envelope.model_dump())

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError):
        corr = _correlation_id(request)
        error = Error(
            code=ErrorCode.INVALID_INPUT,
            message="Request failed schema validation.",
            severity="LOW",
            retryable=False,
            details={"errors": exc.errors()},
            correlation_id=corr,
        )
        envelope = Envelope.failure(_request_id(request), error)
        return JSONResponse(status_code=400, content=envelope.model_dump())

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception):
        corr = _correlation_id(request)
        # Do NOT echo the raw exception message to the client — it may contain
        # internal detail. Log server-side (redacted by the logging filter).
        logger.error("unhandled exception", extra={"correlation_id": corr}, exc_info=exc)
        error = Error(
            code=ErrorCode.INTERNAL_ERROR,
            message="An internal error occurred.",
            severity="HIGH",
            retryable=False,
            correlation_id=corr,
        )
        envelope = Envelope.failure(_request_id(request), error)
        return JSONResponse(status_code=500, content=envelope.model_dump())
