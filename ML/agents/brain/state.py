"""Agent Brain LangGraph state.

Only the context required for the graph lives here. The state is a plain TypedDict
(LangGraph's native state type). It contains NO reference to any signer/execution
handle — the agent structurally cannot move money.
"""

from __future__ import annotations

from typing import TypedDict


class AgentState(TypedDict, total=False):
    # Correlation / limits
    execution_id: str
    agent_id: str
    intent_id: str
    max_iterations: int
    iterations: int

    # Inputs
    intent: dict  # Intent.model_dump()

    # Working memory
    plan: list[str]
    observations: list[dict]
    evidence_ids: list[str]
    candidate_actions: list[dict]
    selected_candidate: dict | None

    # Output
    proposal: dict | None  # ActionProposal.model_dump()
    plan_summary: str
    no_candidate_reason: str | None
