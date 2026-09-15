"""Policy candidate schemas — mirror CONTRACTS.md §8 rule shape.

The AI layer compiles natural-language policy into a structured CANDIDATE plus
diagnostics. It NEVER activates policy (Requirement 7.5) — only Core's deterministic
policy system can move a policy to `active`.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

RuleType = Literal[
    "AMOUNT_LIMIT",
    "CUMULATIVE_LIMIT",
    "RECIPIENT_ALLOWLIST",
    "RECIPIENT_BLOCKLIST",
    "CATEGORY_ALLOW",
    "CATEGORY_BLOCK",
    "ASSET_ALLOW",
    "NETWORK_ALLOW",
    "TIME_WINDOW",
    "NEW_RECIPIENT_APPROVAL",
    "REQUIRED_PREDECESSOR",
    "HUMAN_APPROVAL",
    "NO_STRUCTURING",
    "CAPABILITY_EXPIRY",
]

RequiredAction = Literal["ALLOW", "REVIEW", "DENY", "REQUIRE_APPROVAL"]


class RuleConstraint(BaseModel):
    operator: str | None = None  # e.g. LTE, GTE, IN, NOT_IN
    field: str | None = None
    value: str | list[str] | None = None
    currency: str | None = None


class PolicyRule(BaseModel):
    rule_id: str
    type: RuleType
    condition: dict = Field(default_factory=dict)
    constraint: RuleConstraint = Field(default_factory=RuleConstraint)
    required_action: RequiredAction = "ALLOW"
    priority: int = 100
    enabled: bool = True


class PolicyAmbiguity(BaseModel):
    clause: str
    reason: str


class PolicyConflict(BaseModel):
    rule_ids: list[str]
    reason: str


class PolicyCandidateResult(BaseModel):
    schema_version: Literal["policy_candidate.v1"] = "policy_candidate.v1"
    status: Literal["OK", "AMBIGUOUS", "POLICY_CONFLICT"]
    candidate_rules: list[PolicyRule] = Field(default_factory=list)
    ambiguities: list[PolicyAmbiguity] = Field(default_factory=list)
    conflicts: list[PolicyConflict] = Field(default_factory=list)
    model_metadata: dict | None = None
    # This candidate is NOT active. Only Core may activate a policy.
    activated: Literal[False] = False
