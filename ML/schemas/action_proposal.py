"""ActionProposal schema — mirrors CONTRACTS.md §13/§14.

The ActionProposal is the boundary between Agent Intelligence and SentinelPay
security/execution. It describes what the agent WANTS to do. It is NOT a signed
transaction, NOT authorization, and must never contain a private key
(CONTRACTS.md §14).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ActionType = Literal["PAY", "TRANSFER", "PURCHASE", "CALL_API", "SWAP", "OTHER"]


class Money(BaseModel):
    """Decimal-string amount, never float (CONTRACTS.md §4.3)."""

    value: str
    currency: str


class RecipientRef(BaseModel):
    type: Literal["SERVICE", "WALLET", "CONTRACT", "MERCHANT", "UNKNOWN"] = "UNKNOWN"
    identifier: str | None = None
    address: str | None = None
    network: str | None = None


class ActionProposal(BaseModel):
    schema_version: Literal["action_proposal.v1"] = "action_proposal.v1"
    proposal_id: str
    intent_id: str
    agent_id: str

    action_type: ActionType
    purpose: str

    recipient: RecipientRef | None = None
    amount: Money | None = None
    payment_method: str | None = None
    network: str | None = None

    reason: str = ""
    evidence_ids: list[str] = Field(default_factory=list)
    trajectory_event_ids: list[str] = Field(default_factory=list)

    created_at: str

    # Explicit guard: this object must never carry authority/execution fields.
    # (Enforced structurally by NOT declaring them; a test asserts their absence.)
