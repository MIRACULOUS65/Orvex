"""TrajectoryEvent schema — mirrors CONTRACTS.md §9/§10.

Trajectory events record the agent's observable, ordered sequence of actions.
They form a tamper-evident hash chain (previous_event_hash -> event_hash) so the
security layer can reconstruct where a recipient/amount/instruction was introduced
(the core product differentiator, WORKFLOW.md §10, SECURITY_MODEL.md §41).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

TrustLevelStr = Literal["TRUSTED", "INTERNAL", "EXTERNAL", "UNTRUSTED", "UNKNOWN"]

# V1 event types (CONTRACTS.md §9).
EventType = Literal[
    "USER_REQUEST",
    "INTENT_CREATED",
    "INTENT_UPDATED",
    "PLAN_CREATED",
    "TOOL_CALL",
    "TOOL_RESULT",
    "WEB_ACCESS",
    "API_CALL",
    "MEMORY_READ",
    "MEMORY_WRITE",
    "EXTERNAL_INPUT",
    "OBSERVATION",
    "PLAN_CHANGE",
    "RECIPIENT_CHANGE",
    "AMOUNT_CHANGE",
    "ASSET_CHANGE",
    "PROPOSAL_CREATED",
    "SECURITY_ANALYSIS",
    "POLICY_CHECK",
    "SIMULATION",
    "APPROVAL_REQUEST",
    "APPROVAL_RESULT",
    "EXECUTION_REQUEST",
    "EXECUTION_RESULT",
    "TOOL_ERROR",
]


class TrustContext(BaseModel):
    source_type: str
    trust_level: TrustLevelStr


class TrajectoryEvent(BaseModel):
    schema_version: Literal["trajectory_event.v1"] = "trajectory_event.v1"
    event_id: str
    trace_id: str
    sequence: int
    timestamp: str
    agent_id: str
    event_type: EventType
    action: dict = Field(default_factory=dict)
    input_ref: str | None = None
    output_ref: str | None = None
    trust_context: TrustContext | None = None
    previous_event_hash: str
    event_hash: str
