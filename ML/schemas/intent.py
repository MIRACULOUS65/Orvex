"""Intent schema — mirrors CONTRACTS.md §6 exactly (Requirement 2.1, 10.1).

The Intent is the structured representation of the user's goal. It is NOT a payment
authorization (CONTRACTS.md §6). Monetary values are decimal strings, never floats
(CONTRACTS.md §4.3, Requirement 2.5).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

AutonomyLevel = Literal["MANUAL", "CONDITIONAL", "AUTOMATIC"]
IntentStatus = Literal["VALID", "NEEDS_CLARIFICATION", "EXPIRED", "INVALID"]
BudgetPeriod = Literal["daily", "weekly", "monthly", "once"]


class MoneyLimit(BaseModel):
    """Budget constraint. `maximum` is a decimal STRING — never a float."""

    maximum: str
    currency: str
    period: BudgetPeriod | None = None


class Ambiguity(BaseModel):
    """A field the system could not determine and refuses to invent."""

    field: str
    reason: str


class Intent(BaseModel):
    schema_version: Literal["intent.v1"] = "intent.v1"
    intent_id: str
    user_id: str | None = None
    agent_id: str

    user_goal: str
    purpose: str
    desired_outcome: str

    constraints: list[str] = Field(default_factory=list)
    budget: MoneyLimit | None = None

    authorized_actions: list[str] = Field(default_factory=list)
    forbidden_actions: list[str] = Field(default_factory=list)

    autonomy_level: AutonomyLevel = "MANUAL"
    approval_conditions: list[str] = Field(default_factory=list)

    valid_from: str
    valid_until: str

    status: IntentStatus = "VALID"
    confidence: float | None = None
    ambiguities: list[Ambiguity] = Field(default_factory=list)

    created_at: str

    def needs_clarification(self) -> bool:
        return self.status == "NEEDS_CLARIFICATION"
