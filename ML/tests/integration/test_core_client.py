"""Unit tests for the AI-side CoreClient (integration boundary).

Uses httpx.MockTransport so no live Core is required. Verifies method->endpoint mapping,
header propagation (tenant + correlation + auth), envelope parsing, structured error
handling, safe-retry semantics, and that mutating requests are never blindly retried.
"""

from __future__ import annotations

import httpx
import pytest

from integration.core_client import (
    CoreClient,
    CoreClientConfig,
    CoreClientError,
    CoreEnvelopeError,
    RequestContext,
)


def envelope(data: dict, *, request_id: str = "req_1") -> dict:
    return {"schema_version": "api.v1", "request_id": request_id, "data": data, "error": None, "meta": {}}


def error_envelope(code: str, message: str = "nope") -> dict:
    return {"schema_version": "api.v1", "request_id": "req_1", "data": None, "error": {"code": code, "message": message, "retryable": False, "details": {}}, "meta": {}}


def make_client(handler, *, token: str | None = "tok") -> CoreClient:
    transport = httpx.MockTransport(handler)
    cfg = CoreClientConfig(base_url="http://core.test", service_token=token, max_read_retries=2)
    return CoreClient(cfg, transport=transport)


def test_create_intent_maps_endpoint_and_headers():
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["method"] = request.method
        seen["url"] = str(request.url)
        seen["headers"] = dict(request.headers)
        return httpx.Response(201, json=envelope({"id": "intent_row_1"}))

    client = make_client(handler)
    ctx = RequestContext(company_id="co_1", actor_id="ai")
    data = client.create_intent(ctx, {"intent_id": "i1"})
    assert data["id"] == "intent_row_1"
    assert seen["method"] == "POST"
    assert seen["url"].endswith("/v1/intents")
    # Tenant + correlation + auth headers propagate.
    assert seen["headers"]["x-company-id"] == "co_1"
    assert seen["headers"]["x-correlation-id"] == ctx.correlation_id
    assert seen["headers"]["authorization"] == "Bearer tok"


def test_request_decision_parses_result():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/decisions"
        return httpx.Response(201, json=envelope({"decision": {"id": "dec_1", "result": "ALLOW"}, "result": "ALLOW", "context_hash": "h", "approval_id": None}))

    client = make_client(handler)
    ctx = RequestContext(company_id="co_1")
    decision = client.request_decision(ctx, agent_id="a1", intent={}, proposal={}, security_assessment={})
    assert decision.result == "ALLOW"
    assert decision.decision_id == "dec_1"
    assert decision.context_hash == "h"


def test_structured_error_envelope_raises_typed_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(422, json=error_envelope("PROPOSAL_INVALID", "bad ref"))

    client = make_client(handler)
    ctx = RequestContext(company_id="co_1")
    with pytest.raises(CoreEnvelopeError) as ei:
        client.create_proposal(ctx, {"proposal_id": "p1"})
    assert ei.value.code == "PROPOSAL_INVALID"
    assert ei.value.status_code == 422


def test_network_failure_is_never_silent_success():
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    client = make_client(handler)
    ctx = RequestContext(company_id="co_1")
    with pytest.raises(CoreClientError):
        client.request_decision(ctx, agent_id="a1", intent={}, proposal={}, security_assessment={})


def test_mutating_post_is_not_retried_but_reads_are():
    calls = {"decisions": 0, "get": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST" and request.url.path == "/v1/decisions":
            calls["decisions"] += 1
            # First (and only) attempt: connection error -> must NOT retry a mutation.
            raise httpx.ConnectError("boom")
        if request.method == "GET":
            calls["get"] += 1
            if calls["get"] < 3:
                raise httpx.ConnectError("transient")
            return httpx.Response(200, json=envelope({"id": "dec_1"}))
        return httpx.Response(200, json=envelope({}))

    client = make_client(handler)
    ctx = RequestContext(company_id="co_1")

    # Mutating POST: exactly one attempt (no blind retry).
    with pytest.raises(CoreClientError):
        client.request_decision(ctx, agent_id="a1", intent={}, proposal={}, security_assessment={})
    assert calls["decisions"] == 1

    # Safe GET: retried up to max_read_retries (2) + 1 = 3 attempts, then succeeds.
    data = client.get_decision(ctx, "dec_1")
    assert data["id"] == "dec_1"
    assert calls["get"] == 3


def test_idempotency_key_header_sent_on_decision():
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["idem"] = request.headers.get("idempotency-key")
        return httpx.Response(201, json=envelope({"decision": {"id": "d", "result": "ALLOW"}, "result": "ALLOW", "context_hash": "h"}))

    client = make_client(handler)
    ctx = RequestContext(company_id="co_1")
    client.request_decision(ctx, agent_id="a1", intent={}, proposal={}, security_assessment={}, idempotency_key="idem-123")
    assert seen["idem"] == "idem-123"
