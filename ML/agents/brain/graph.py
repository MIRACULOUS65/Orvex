"""Agent Brain — LangGraph orchestration.

Graph: START -> LOAD_INTENT -> PLAN -> RESEARCH -> COMPARE -> (loop|PROPOSE) -> END

LangGraph provides the stateful control flow; our own ProviderRouter and
ToolRegistry provide the model calls and (security-enforced, read-only) tools.
No node can reach a signer/execution API — none exists in this service.

The final output is a validated ActionProposal (CONTRACTS.md §13). The agent NEVER
executes a payment (Requirement 3.4, 3.5).
"""

from __future__ import annotations

import json

from langgraph.graph import END, START, StateGraph

from agents.brain.state import AgentState
from agents.shared.evidence import make_evidence
from agents.shared.proposal_builder import build_proposal
from memory.short_term.session_state import ExecutionContext, TrajectoryBuffer
from models.provider.base import GenerationRequest
from models.provider.router import ProviderRouter
from schemas.evidence import Evidence
from shared.logging import get_logger
from shared.prompts import render_prompt
from tools.registry import ToolRegistry
from tools.search.search_tool import SearchInput
from tools.web.web_fetch_tool import WebFetchInput

logger = get_logger("agents.brain")


class AgentBrain:
    """Holds dependencies and builds the compiled LangGraph agent."""

    def __init__(
        self,
        *,
        provider: ProviderRouter,
        registry: ToolRegistry,
        context: ExecutionContext,
        trajectory: TrajectoryBuffer,
    ):
        self._provider = provider
        self._registry = registry
        self._context = context
        self._trajectory = trajectory
        self._evidence: list[Evidence] = []
        self._graph = self._build()

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    @property
    def evidence(self) -> list[Evidence]:
        return list(self._evidence)

    async def run(self, intent: dict) -> AgentState:
        initial: AgentState = {
            "execution_id": self._context.execution_id,
            "agent_id": self._context.agent_id,
            "intent_id": intent.get("intent_id", self._context.intent_id or ""),
            "intent": intent,
            "max_iterations": self._context.max_iterations,
            "iterations": 0,
            "plan": [],
            "observations": [],
            "evidence_ids": [],
            "candidate_actions": [],
            "selected_candidate": None,
            "proposal": None,
            "plan_summary": "",
            "no_candidate_reason": None,
        }
        return await self._graph.ainvoke(initial)

    # ------------------------------------------------------------------ #
    # Graph construction
    # ------------------------------------------------------------------ #
    def _build(self):
        g = StateGraph(AgentState)
        g.add_node("LOAD_INTENT", self._load_intent)
        g.add_node("PLAN", self._plan)
        g.add_node("RESEARCH", self._research)
        g.add_node("COMPARE", self._compare)
        g.add_node("PROPOSE", self._propose)

        g.add_edge(START, "LOAD_INTENT")
        g.add_edge("LOAD_INTENT", "PLAN")
        g.add_edge("PLAN", "RESEARCH")
        g.add_edge("RESEARCH", "COMPARE")
        g.add_conditional_edges(
            "COMPARE",
            self._should_continue_research,
            {"research": "RESEARCH", "propose": "PROPOSE"},
        )
        g.add_edge("PROPOSE", END)
        return g.compile()

    # ------------------------------------------------------------------ #
    # Nodes
    # ------------------------------------------------------------------ #
    async def _load_intent(self, state: AgentState) -> AgentState:
        self._trajectory.append(
            event_type="INTENT_CREATED",
            action={"intent_id": state.get("intent_id")},
        )
        return state

    async def _plan(self, state: AgentState) -> AgentState:
        prompt = render_prompt("agent", "plan_v1", intent=json.dumps(state["intent"]))
        request = GenerationRequest(
            system_prompt=prompt,
            messages=[{"role": "user", "content": "Produce the research plan."}],
            prompt_version="plan_v1",
        )
        resp = await self._provider.generate_structured(request, dict)
        plan = (resp.structured or {}).get("plan", [])
        if not isinstance(plan, list) or not plan:
            plan = ["Identify candidate providers", "Compare against budget and intent"]
        self._trajectory.append(event_type="PLAN_CREATED", action={"steps": plan})
        state["plan"] = [str(s) for s in plan]
        state["plan_summary"] = "; ".join(state["plan"])
        return state

    async def _research(self, state: AgentState) -> AgentState:
        state["iterations"] = state.get("iterations", 0) + 1
        intent = state["intent"]
        query = intent.get("purpose") or intent.get("user_goal", "service")

        # Search (untrusted external data).
        search_result = await self._registry.call(
            "search",
            SearchInput(query=str(query), max_results=5),
            context=self._context,
            trajectory=self._trajectory,
        )
        results = getattr(search_result.output, "results", [])
        for r in results:
            ev = make_evidence(
                source_id=r.url,
                source_type="SEARCH",
                trust_level="UNTRUSTED",
                content=r.snippet,
                claim=r.title,
                raw_reference=r.url,
                trajectory_event_ids=self._trajectory.event_ids[-1:],
            )
            self._evidence.append(ev)
            state.setdefault("evidence_ids", []).append(ev.evidence_id)
            state.setdefault("observations", []).append(
                {"title": r.title, "url": r.url, "snippet": r.snippet}
            )
        return state

    async def _compare(self, state: AgentState) -> AgentState:
        observations = state.get("observations", [])
        prompt = render_prompt(
            "agent",
            "compare_v1",
            intent=json.dumps(state["intent"]),
            observations=json.dumps(observations),
        )
        request = GenerationRequest(
            system_prompt=prompt,
            messages=[{"role": "user", "content": "Select the best candidate action or say none."}],
            prompt_version="compare_v1",
        )
        resp = await self._provider.generate_structured(request, dict)
        data = resp.structured or {}
        candidate = self._extract_candidate(data)

        # Reliability: if observations exist but the (possibly weaker fallback) model
        # returned no candidate, retry the selection ONCE. This never fabricates —
        # the model must still ground the candidate in the observations.
        if candidate is None and observations:
            retry = await self._provider.generate_structured(request, dict)
            candidate = self._extract_candidate(retry.structured or {})
        if candidate:
            state["selected_candidate"] = candidate
            self._trajectory.append(
                event_type="OBSERVATION",
                action={"selected": candidate.get("purpose", "candidate")},
            )
        else:
            state["selected_candidate"] = None
            state["no_candidate_reason"] = str(data.get("reason", "No suitable candidate found."))
        return state

    @staticmethod
    def _extract_candidate(data: dict) -> dict | None:
        """Tolerate model shape variance: accept selected_candidate, candidate, or a
        top-level object that itself looks like a candidate (has action_type/amount)."""
        for key in ("selected_candidate", "candidate", "action"):
            value = data.get(key)
            if isinstance(value, dict) and value:
                return value
        # Top-level candidate shape (some models skip the wrapper key).
        if data.get("action_type") or data.get("amount"):
            return data
        return None

    def _should_continue_research(self, state: AgentState) -> str:
        if state.get("selected_candidate"):
            return "propose"
        if state.get("iterations", 0) >= state.get("max_iterations", 4):
            return "propose"  # give up gracefully; PROPOSE emits a no-candidate result
        return "research"

    async def _propose(self, state: AgentState) -> AgentState:
        candidate = state.get("selected_candidate")
        if not candidate:
            # No proposal — record and return without fabricating one.
            self._trajectory.append(
                event_type="OBSERVATION",
                action={"no_candidate": state.get("no_candidate_reason")},
            )
            state["proposal"] = None
            return state

        proposal = build_proposal(
            intent_id=state.get("intent_id", ""),
            agent_id=state["agent_id"],
            candidate=candidate,
            evidence_ids=state.get("evidence_ids", []),
            trajectory_event_ids=self._trajectory.event_ids,
        )
        self._trajectory.append(
            event_type="PROPOSAL_CREATED",
            action={
                "proposal_id": proposal.proposal_id,
                "action_type": proposal.action_type,
                "amount": proposal.amount.model_dump() if proposal.amount else None,
                "recipient": proposal.recipient.model_dump() if proposal.recipient else None,
            },
        )
        state["proposal"] = proposal.model_dump()
        return state
