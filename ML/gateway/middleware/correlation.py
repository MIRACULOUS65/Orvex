"""Request correlation context.

Every request into the AI service carries correlation identifiers so that a single
end-to-end task is traceable across Intent -> Agent -> Trajectory -> Security -> Core
(WORKFLOW.md §5, CONTRACTS.md §45). This module builds a ``RequestContext`` from
incoming headers/body and exposes it as a FastAPI dependency.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from fastapi import Request


@dataclass(frozen=True)
class RequestContext:
    """Correlation identifiers bound to one request. Immutable."""

    request_id: str
    correlation_id: str
    execution_id: str | None = None
    agent_id: str | None = None
    intent_id: str | None = None
    proposal_id: str | None = None
    trace_id: str | None = None
    tenant_id: str | None = None
    extra: dict = field(default_factory=dict)

    def log_fields(self) -> dict:
        """Fields to attach to every structured log line for this request."""
        return {
            "request_id": self.request_id,
            "correlation_id": self.correlation_id,
            "execution_id": self.execution_id,
            "agent_id": self.agent_id,
            "intent_id": self.intent_id,
            "proposal_id": self.proposal_id,
            "trace_id": self.trace_id,
            "tenant_id": self.tenant_id,
        }


_HEADER_MAP = {
    "correlation_id": "x-correlation-id",
    "execution_id": "x-execution-id",
    "agent_id": "x-agent-id",
    "intent_id": "x-intent-id",
    "proposal_id": "x-proposal-id",
    "trace_id": "x-trace-id",
    "tenant_id": "x-tenant-id",
}


async def correlation_context(request: Request) -> RequestContext:
    """FastAPI dependency. Derives correlation identifiers from headers.

    Precedence: explicit header value, else a freshly generated id for
    request_id/correlation_id. Body-level identifiers (execution_id, etc.) are
    also read from the parsed request models downstream and merged there; headers
    provide a transport-level fallback so tracing works even for minimal requests.
    """
    headers = request.headers
    request_id = headers.get("x-request-id") or f"req_{uuid.uuid4().hex[:16]}"
    correlation_id = headers.get(_HEADER_MAP["correlation_id"]) or f"corr_{uuid.uuid4().hex[:16]}"

    ctx = RequestContext(
        request_id=request_id,
        correlation_id=correlation_id,
        execution_id=headers.get(_HEADER_MAP["execution_id"]),
        agent_id=headers.get(_HEADER_MAP["agent_id"]),
        intent_id=headers.get(_HEADER_MAP["intent_id"]),
        proposal_id=headers.get(_HEADER_MAP["proposal_id"]),
        trace_id=headers.get(_HEADER_MAP["trace_id"]),
        tenant_id=headers.get(_HEADER_MAP["tenant_id"]),
    )
    # Stash on request.state so middleware (error handling, timing) can read it too.
    request.state.context = ctx
    return ctx
