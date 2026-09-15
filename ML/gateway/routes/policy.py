"""Policy AI routes: POST /policy/compile, POST /policy/validate (Requirements 7.1, 7.6).

The AI service returns a structured candidate + diagnostics. It NEVER activates a
policy — activation is Core's deterministic responsibility.
"""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from gateway.middleware.correlation import RequestContext, correlation_context
from policy_ai.compiler.compiler import PolicyCompiler
from policy_ai.validator.validator import validate_rules
from schemas.envelope import Envelope, Metadata
from schemas.policy_candidate import PolicyCandidateResult, PolicyRule

router = APIRouter(tags=["policy"])


class PolicyCompileRequest(BaseModel):
    execution_id: str | None = None
    agent_id: str | None = None
    text: str = Field(min_length=1)


class PolicyValidateRequest(BaseModel):
    rules: list[PolicyRule]
    text: str = ""


def _compiler() -> PolicyCompiler:
    from gateway.app import get_primary_provider

    return PolicyCompiler(get_primary_provider())


def _envelope_status(result: PolicyCandidateResult) -> str:
    if result.status == "AMBIGUOUS":
        return "NEEDS_CLARIFICATION"
    if result.status == "POLICY_CONFLICT":
        return "ERROR"
    return "OK"


@router.post("/policy/compile", response_model=Envelope[PolicyCandidateResult])
async def compile_policy(
    req: PolicyCompileRequest,
    ctx: RequestContext = Depends(correlation_context),
    compiler: PolicyCompiler = Depends(_compiler),
) -> Envelope[PolicyCandidateResult]:
    start = time.perf_counter()
    result = await compiler.compile(req.text)
    metadata = Metadata(latency_ms=(time.perf_counter() - start) * 1000)
    return Envelope(
        request_id=ctx.request_id,
        status=_envelope_status(result),
        data=result,
        metadata=metadata,
    )


@router.post("/policy/validate", response_model=Envelope[PolicyCandidateResult])
async def validate_policy(
    req: PolicyValidateRequest,
    ctx: RequestContext = Depends(correlation_context),
) -> Envelope[PolicyCandidateResult]:
    result = validate_rules(req.rules, req.text)
    return Envelope(request_id=ctx.request_id, status=_envelope_status(result), data=result)
