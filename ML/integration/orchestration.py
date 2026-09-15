"""ML -> Core orchestration.

Connects the artifacts produced by the EXISTING ML modules (Intent, ActionProposal,
SecurityAssessment) to the Core /v1 API and returns Core's deterministic decision. This
layer contains NO AI logic and NO authorization logic — it is pure relay:

    Intent            -> POST /v1/intents
    ActionProposal    -> POST /v1/proposals
    SecurityAssessment-> POST /v1/proposals/{id}/assessments
    (decide)          -> POST /v1/decisions   (Core decides ALLOW/REVIEW/DENY)

The AI recommendation inside the SecurityAssessment is carried as evidence only; Core
independently evaluates policy + transaction state. Correlation id and tenant context
are propagated on every hop.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from integration.core_client import CoreClient, CoreDecision, RequestContext


def _to_dict(obj: Any) -> dict[str, Any]:
    """Normalize a Pydantic model or dict into a plain JSON-able dict."""
    if hasattr(obj, "model_dump"):
        return obj.model_dump(mode="json")
    if isinstance(obj, dict):
        return obj
    raise TypeError(f"Cannot serialize {type(obj)!r} to a contract dict.")


@dataclass
class OrchestrationResult:
    """The full result of relaying one proposal through Core."""

    intent_row_id: str
    proposal_row_id: str
    assessment_row_id: str
    decision: CoreDecision
    correlation_id: str


class MLToCoreOrchestrator:
    """Relays existing ML contract objects to Core and returns the deterministic decision.

    Instantiated with a CoreClient. Each `run(...)` performs the full intent ->
    proposal -> assessment -> decision relay for one company/agent.
    """

    def __init__(self, client: CoreClient):
        self._client = client

    def run(
        self,
        *,
        company_id: str,
        agent_id: str,
        intent: Any,
        proposal: Any,
        security_assessment: Any,
        actor_id: str = "ai-service",
        correlation_id: str | None = None,
        trace_id: str | None = None,
    ) -> OrchestrationResult:
        ctx = RequestContext(company_id=company_id, actor_id=actor_id)
        if correlation_id:
            ctx.correlation_id = correlation_id

        intent_d = _to_dict(intent)
        proposal_d = _to_dict(proposal)
        assessment_d = _to_dict(security_assessment)

        # 1) Persist the intent in Core.
        intent_row = self._client.create_intent(ctx, intent_d)
        intent_row_id = str(intent_row.get("id", ""))

        # 2) Persist the proposal (Core reference-checks intent/agent within the tenant).
        #    Bind the proposal to the Core-side intent row id so references resolve.
        proposal_payload = {**proposal_d, "intent_id": intent_row_id}
        proposal_row = self._client.create_proposal(ctx, proposal_payload)
        proposal_row_id = str(proposal_row.get("id", ""))

        # 3) Submit the AI SecurityAssessment as intelligence (never authority).
        assessment_row = self._client.submit_security_assessment(ctx, proposal_row_id, assessment_d)
        assessment_row_id = str(assessment_row.get("id", ""))

        # 4) Ask Core for the deterministic decision. Core independently evaluates
        #    policy + transaction state; the AI recommendation cannot override it.
        decision = self._client.request_decision(
            ctx,
            agent_id=agent_id,
            intent=intent_d,
            proposal=proposal_d,
            security_assessment=assessment_d,
            trace_id=trace_id,
        )

        return OrchestrationResult(
            intent_row_id=intent_row_id,
            proposal_row_id=proposal_row_id,
            assessment_row_id=assessment_row_id,
            decision=decision,
            correlation_id=ctx.correlation_id,
        )
