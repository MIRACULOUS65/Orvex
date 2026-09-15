"""Typed AI-side client for the SentinelPay Core /v1 API.

The Core is the authorization boundary. The AI layer talks to it ONLY over HTTP (never
its database). This client:

  - sends the tenant/company context, actor identity, and a correlation id on every
    request, so the correlation survives the entire path;
  - authenticates with the shared internal service token (Bearer);
  - applies a request timeout;
  - parses Core's canonical `api.v1` envelope and raises structured errors;
  - retries ONLY safe, idempotent reads (GET) with bounded backoff — it NEVER blindly
    retries a financial/state-mutating request (decisions/executions), because a blind
    retry could create duplicate authorization/execution;
  - supports an idempotency key for mutating operations where Core accepts one.

It maps directly to the existing Core endpoints (do not add new Core endpoints):

  POST /v1/intents
  POST /v1/proposals
  POST /v1/proposals/{proposal_id}/assessments
  POST /v1/decisions
"""

from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx


class CoreClientError(RuntimeError):
    """Transport/connection failure talking to Core (never a silent success)."""


class CoreEnvelopeError(RuntimeError):
    """Core returned a structured error envelope. Carries the Core error code."""

    def __init__(self, code: str, message: str, status_code: int, details: dict | None = None):
        super().__init__(f"[{code}] {message}")
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


@dataclass
class CoreClientConfig:
    """Connection + identity configuration. All values may come from the environment
    so nothing is hard-coded (CORE_BASE_URL, AI_INTERNAL_SERVICE_TOKEN)."""

    base_url: str = field(default_factory=lambda: os.environ.get("CORE_BASE_URL", "http://localhost:8091"))
    service_token: str | None = field(default_factory=lambda: os.environ.get("AI_INTERNAL_SERVICE_TOKEN"))
    timeout_s: float = 15.0
    # Bounded retry for SAFE reads only.
    max_read_retries: int = 2
    actor_role: str = "SERVICE"

    def normalized_base(self) -> str:
        return self.base_url.rstrip("/")


@dataclass
class CoreDecision:
    """The deterministic decision Core returned for a proposal."""

    decision_id: str
    result: str  # ALLOW | REVIEW | DENY
    context_hash: str
    approval_id: str | None
    raw: dict[str, Any]


@dataclass
class RequestContext:
    """Per-call tenant + correlation context. Survives across the whole ML->Core path."""

    company_id: str
    actor_id: str = "ai-service"
    correlation_id: str = field(default_factory=lambda: f"corr_{uuid.uuid4().hex[:16]}")


class CoreClient:
    """Typed HTTP client for the Core /v1 API. Construct once per process (or per test)."""

    def __init__(self, config: CoreClientConfig | None = None, *, transport: httpx.BaseTransport | None = None):
        self._config = config or CoreClientConfig()
        # `transport` is injectable so unit tests can drive a MockTransport without a
        # live server (the live round-trip test uses a real network client).
        self._client = httpx.Client(
            base_url=self._config.normalized_base(),
            timeout=self._config.timeout_s,
            transport=transport,
        )

    # ------------------------------------------------------------------ #
    # Low-level request handling
    # ------------------------------------------------------------------ #
    def _headers(self, ctx: RequestContext, idempotency_key: str | None) -> dict[str, str]:
        headers = {
            "content-type": "application/json",
            "x-company-id": ctx.company_id,
            "x-actor-id": ctx.actor_id,
            "x-actor-role": self._config.actor_role,
            "x-correlation-id": ctx.correlation_id,
        }
        if self._config.service_token:
            headers["authorization"] = f"Bearer {self._config.service_token}"
        if idempotency_key:
            headers["idempotency-key"] = idempotency_key
        return headers

    def _post(
        self,
        path: str,
        body: dict[str, Any],
        ctx: RequestContext,
        *,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        # Mutating POSTs are NEVER blindly retried — a duplicate could authorize twice.
        return self._request("POST", path, ctx, json_body=body, idempotency_key=idempotency_key, retryable=False)

    def _get(self, path: str, ctx: RequestContext) -> dict[str, Any]:
        # Reads are safe to retry with bounded backoff.
        return self._request("GET", path, ctx, retryable=True)

    def _request(
        self,
        method: str,
        path: str,
        ctx: RequestContext,
        *,
        json_body: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
        retryable: bool,
    ) -> dict[str, Any]:
        headers = self._headers(ctx, idempotency_key)
        attempts = (self._config.max_read_retries + 1) if retryable else 1
        last_exc: Exception | None = None
        for attempt in range(attempts):
            try:
                resp = self._client.request(method, path, headers=headers, json=json_body)
            except httpx.HTTPError as exc:  # network/timeout — do NOT convert to success
                last_exc = exc
                if retryable and attempt < attempts - 1:
                    time.sleep(0.1 * (attempt + 1))
                    continue
                raise CoreClientError(f"Core request failed: {exc}") from exc
            return self._parse_envelope(resp)
        # Unreachable, but keep the type-checker happy.
        raise CoreClientError(f"Core request failed: {last_exc}")

    @staticmethod
    def _parse_envelope(resp: httpx.Response) -> dict[str, Any]:
        try:
            payload = resp.json()
        except ValueError as exc:
            raise CoreClientError(f"Core returned non-JSON (status {resp.status_code}).") from exc

        error = payload.get("error")
        if error is not None:
            raise CoreEnvelopeError(
                code=str(error.get("code", "UNKNOWN")),
                message=str(error.get("message", "Core error.")),
                status_code=resp.status_code,
                details=error.get("details"),
            )
        if resp.status_code >= 400:
            raise CoreEnvelopeError("HTTP_ERROR", f"Core HTTP {resp.status_code}.", resp.status_code)
        return payload.get("data", {})

    # ------------------------------------------------------------------ #
    # Typed operations (map 1:1 to existing Core endpoints)
    # ------------------------------------------------------------------ #
    def create_intent(self, ctx: RequestContext, intent: dict[str, Any]) -> dict[str, Any]:
        """POST /v1/intents — persist an AI-produced Intent contract in Core."""
        return self._post("/v1/intents", intent, ctx)

    def create_proposal(self, ctx: RequestContext, proposal: dict[str, Any]) -> dict[str, Any]:
        """POST /v1/proposals — persist an AI-produced ActionProposal (reference-checked by Core)."""
        return self._post("/v1/proposals", proposal, ctx)

    def submit_security_assessment(
        self, ctx: RequestContext, proposal_row_id: str, assessment: dict[str, Any]
    ) -> dict[str, Any]:
        """POST /v1/proposals/{id}/assessments — store AI intelligence (NOT authority)."""
        return self._post(f"/v1/proposals/{proposal_row_id}/assessments", assessment, ctx)

    def request_decision(
        self,
        ctx: RequestContext,
        *,
        agent_id: str,
        intent: dict[str, Any],
        proposal: dict[str, Any],
        security_assessment: dict[str, Any],
        trace_id: str | None = None,
        idempotency_key: str | None = None,
    ) -> CoreDecision:
        """POST /v1/decisions — Core deterministically decides ALLOW/REVIEW/DENY.

        This is the authorization boundary: whatever the AI recommends, Core independently
        evaluates policy + transaction state. Not blindly retried (mutating).
        """
        body: dict[str, Any] = {
            "agent_id": agent_id,
            "intent": intent,
            "proposal": proposal,
            "security_assessment": security_assessment,
        }
        if trace_id:
            body["trace_id"] = trace_id
        data = self._post("/v1/decisions", body, ctx, idempotency_key=idempotency_key)
        decision = data.get("decision", {})
        return CoreDecision(
            decision_id=str(decision.get("id", "")),
            result=str(data.get("result", decision.get("result", ""))),
            context_hash=str(data.get("context_hash", "")),
            approval_id=data.get("approval_id"),
            raw=data,
        )

    def get_decision(self, ctx: RequestContext, decision_id: str) -> dict[str, Any]:
        """GET /v1/decisions/{id} — safe read (retryable)."""
        return self._get(f"/v1/decisions/{decision_id}", ctx)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> CoreClient:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()
