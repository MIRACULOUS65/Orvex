"""Builds a validated ActionProposal from the agent's selected candidate.

Deterministic assembly: takes the LLM-selected candidate dict + intent + trajectory
refs and produces a schema-valid ActionProposal. Validates that the amount is a
decimal string and refuses to fabricate a recipient the agent never selected.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from schemas.action_proposal import ActionProposal, Money, RecipientRef


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _valid_decimal(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        d = Decimal(value.strip())
    except (InvalidOperation, ValueError):
        return False
    return d.is_finite()  # reject NaN / Infinity


def build_proposal(
    *,
    intent_id: str,
    agent_id: str,
    candidate: dict,
    evidence_ids: list[str],
    trajectory_event_ids: list[str],
) -> ActionProposal:
    """Assemble an ActionProposal. `candidate` is the agent-selected action."""
    amount = None
    raw_amount = candidate.get("amount")
    if isinstance(raw_amount, dict) and _valid_decimal(raw_amount.get("value")):
        amount = Money(value=raw_amount["value"], currency=str(raw_amount.get("currency", "")))

    recipient = None
    raw_recipient = candidate.get("recipient")
    if isinstance(raw_recipient, dict) and (
        raw_recipient.get("identifier") or raw_recipient.get("address")
    ):
        recipient = RecipientRef(
            type=raw_recipient.get("type", "UNKNOWN"),
            identifier=raw_recipient.get("identifier"),
            address=raw_recipient.get("address"),
            network=raw_recipient.get("network"),
        )

    return ActionProposal(
        proposal_id=f"proposal_{uuid.uuid4().hex[:12]}",
        intent_id=intent_id,
        agent_id=agent_id,
        action_type=candidate.get("action_type", "PAY"),
        purpose=str(candidate.get("purpose", "unspecified")),
        recipient=recipient,
        amount=amount,
        payment_method=candidate.get("payment_method"),
        network=candidate.get("network") or (recipient.network if recipient else None),
        reason=str(candidate.get("reason", "")),
        evidence_ids=evidence_ids,
        trajectory_event_ids=trajectory_event_ids,
        created_at=_now_iso(),
    )
