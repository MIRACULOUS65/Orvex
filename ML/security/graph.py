"""Security Intelligence — LangGraph orchestration.

Graph: START -> LOAD_CONTEXT -> VERIFY_INTENT -> THREAT_ANALYSIS -> REPUTATION
       -> ANOMALY -> RISK -> EXPLANATION -> END

RISK runs AFTER the four upstream signals so it is a pure aggregator
(IMPLEMENTATION.md §15). Produces one SecurityAssessment. NEVER emits an
authorization field (Requirement 8.2). No node can reach execution.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from langgraph.graph import END, START, StateGraph

from models.provider.router import ProviderRouter
from schemas.security_assessment import (
    AnomalyAssessment,
    IntentVerificationResult,
    OverallAssessment,
    ReputationAssessment,
    RiskAssessment,
    SecurityAssessment,
    ThreatAssessment,
)
from security.anomaly.detector import AnomalyDetector
from security.explanations.engine import ExplanationEngine
from security.intent_verifier.verifier import IntentVerifier
from security.reputation.analyzer import ReputationAnalyzer
from security.risk.engine import RiskEngine
from security.state import SecurityState
from security.threat_detector.detector import ThreatDetector
from shared.logging import get_logger

logger = get_logger("security.graph")


class SecurityPipeline:
    def __init__(self, *, provider: ProviderRouter | None):
        self._verifier = IntentVerifier(provider)
        self._threat = ThreatDetector(provider)
        self._reputation = ReputationAnalyzer()
        self._anomaly = AnomalyDetector()
        self._risk = RiskEngine()
        self._explain = ExplanationEngine()
        self._graph = self._build()

    async def analyze(
        self,
        *,
        intent: dict,
        proposal: dict,
        trajectory: list[dict] | None = None,
        evidence: list[dict] | None = None,
        recipient_context: dict | None = None,
        historical_behavior: dict | None = None,
    ) -> SecurityAssessment:
        state: SecurityState = {
            "intent": intent,
            "proposal": proposal,
            "trajectory": trajectory or [],
            "evidence": evidence or [],
            "recipient_context": recipient_context,
            "historical_behavior": historical_behavior,
        }
        final = await self._graph.ainvoke(state)
        return self._assemble(final, proposal)

    # ------------------------------------------------------------------ #
    def _build(self):
        g = StateGraph(SecurityState)
        g.add_node("LOAD_CONTEXT", self._load_context)
        g.add_node("VERIFY_INTENT", self._verify_intent)
        g.add_node("THREAT_ANALYSIS", self._threat_analysis)
        g.add_node("REPUTATION", self._reputation_node)
        g.add_node("ANOMALY", self._anomaly_node)
        g.add_node("RISK", self._risk_node)
        g.add_node("EXPLANATION", self._explanation_node)

        g.add_edge(START, "LOAD_CONTEXT")
        g.add_edge("LOAD_CONTEXT", "VERIFY_INTENT")
        g.add_edge("VERIFY_INTENT", "THREAT_ANALYSIS")
        g.add_edge("THREAT_ANALYSIS", "REPUTATION")
        g.add_edge("REPUTATION", "ANOMALY")
        g.add_edge("ANOMALY", "RISK")
        g.add_edge("RISK", "EXPLANATION")
        g.add_edge("EXPLANATION", END)
        return g.compile()

    async def _load_context(self, state: SecurityState) -> SecurityState:
        return state

    async def _verify_intent(self, state: SecurityState) -> SecurityState:
        try:
            result = await self._verifier.verify(
                intent=state["intent"],
                proposal=state["proposal"],
                trajectory=state.get("trajectory", []),
                evidence=state.get("evidence", []),
            )
        except Exception as exc:  # fail closed: never crash the request
            logger.warning("intent verify degraded", extra={"error": type(exc).__name__})
            result = IntentVerificationResult(
                status="UNCERTAIN", intent_match=False, score=0.0, dimensions={},
                reasons=["Intent verification unavailable; treated as uncertain."], confidence=0.3,
            )
        state["intent_verification"] = result.model_dump()
        return state

    async def _threat_analysis(self, state: SecurityState) -> SecurityState:
        try:
            result = await self._threat.analyze(
                intent=state["intent"],
                proposal=state["proposal"],
                trajectory=state.get("trajectory", []),
                evidence=state.get("evidence", []),
            )
        except Exception as exc:  # fail closed: degrade to a cautious result
            logger.warning("threat analysis degraded", extra={"error": type(exc).__name__})
            result = ThreatAssessment(
                detected=False, severity=None, categories=[], confidence=0.0,
                explanation="Threat analysis unavailable.", recommended_handling="REVIEW",
            )
        state["threat_assessment"] = result.model_dump()
        return state

    async def _reputation_node(self, state: SecurityState) -> SecurityState:
        recipient = state["proposal"].get("recipient") or {}
        result = self._reputation.analyze(state.get("recipient_context"), entity=recipient)
        state["reputation_assessment"] = result.model_dump()
        return state

    async def _anomaly_node(self, state: SecurityState) -> SecurityState:
        result = self._anomaly.analyze(
            proposal=state["proposal"],
            historical_behavior=state.get("historical_behavior"),
        )
        state["anomaly_assessment"] = result.model_dump()
        return state

    async def _risk_node(self, state: SecurityState) -> SecurityState:
        result = self._risk.aggregate(
            intent_v=IntentVerificationResult(**state["intent_verification"]),
            threat=ThreatAssessment(**state["threat_assessment"]),
            reputation=ReputationAssessment(**state["reputation_assessment"]),
            anomaly=AnomalyAssessment(**state["anomaly_assessment"]),
        )
        state["risk_assessment"] = result.model_dump()
        return state

    async def _explanation_node(self, state: SecurityState) -> SecurityState:
        state["explanation"] = self._explain.explain(
            intent_v=IntentVerificationResult(**state["intent_verification"]),
            threat=ThreatAssessment(**state["threat_assessment"]),
            reputation=ReputationAssessment(**state["reputation_assessment"]),
            anomaly=AnomalyAssessment(**state["anomaly_assessment"]),
            risk=RiskAssessment(**state["risk_assessment"]),
        )
        return state

    # ------------------------------------------------------------------ #
    def _assemble(self, state: SecurityState, proposal: dict) -> SecurityAssessment:
        intent_v = IntentVerificationResult(**state["intent_verification"])
        threat = ThreatAssessment(**state["threat_assessment"])
        reputation = ReputationAssessment(**state["reputation_assessment"])
        anomaly = AnomalyAssessment(**state["anomaly_assessment"])
        risk = RiskAssessment(**state["risk_assessment"])

        overall = self._overall(intent_v, threat, risk, reputation, anomaly)

        evidence_ids = list(
            dict.fromkeys(intent_v.evidence_ids + threat.evidence_ids + risk.evidence_ids)
        )
        return SecurityAssessment(
            assessment_id=f"assessment_{uuid.uuid4().hex[:12]}",
            proposal_id=proposal.get("proposal_id", "unknown"),
            intent_verification=intent_v,
            threat_assessment=threat,
            reputation_assessment=reputation,
            anomaly_assessment=anomaly,
            risk_assessment=risk,
            overall_assessment=overall,
            explanation=state.get("explanation", ""),
            evidence_ids=evidence_ids,
            created_at=datetime.now(timezone.utc).isoformat(),
        )

    def _overall(
        self,
        intent_v: IntentVerificationResult,
        threat: ThreatAssessment,
        risk: RiskAssessment,
        reputation: "ReputationAssessment | None" = None,
        anomaly: "AnomalyAssessment | None" = None,
    ) -> OverallAssessment:
        # Map to advisory recommended_handling. Core makes the real decision.
        status_map = {
            "LOW": "LOW_RISK",
            "MEDIUM": "MEDIUM_RISK",
            "HIGH": "HIGH_RISK",
            "CRITICAL": "HIGH_RISK",
            "INSUFFICIENT_EVIDENCE": "INSUFFICIENT_EVIDENCE",
        }
        status = status_map.get(risk.level, "MEDIUM_RISK")

        # "Unknown is not safe" (SECURITY_MODEL.md §68/§110): if we could not
        # establish recipient reputation AND have no behavioral baseline, we lack
        # the evidence to auto-proceed — escalate to REVIEW.
        blind = (
            reputation is not None
            and anomaly is not None
            and reputation.data_quality == "UNAVAILABLE"
            and anomaly.level == "INSUFFICIENT_EVIDENCE"
        )

        # Recommended handling (advisory).
        if intent_v.status == "FAIL" or threat.severity in ("HIGH", "CRITICAL"):
            handling = "DENY_RECOMMENDED"
        elif intent_v.status in ("UNCERTAIN", "INSUFFICIENT_EVIDENCE"):
            handling = "REVIEW"
        elif risk.level in ("HIGH", "CRITICAL", "INSUFFICIENT_EVIDENCE", "MEDIUM"):
            handling = "REVIEW"
        elif blind:
            handling = "REVIEW"
        else:
            handling = "PROCEED_CANDIDATE"

        summary_bits = []
        if intent_v.status != "PASS":
            summary_bits.append(f"intent {intent_v.status}")
        if threat.detected:
            summary_bits.append(f"threat {threat.severity}")
        summary = (
            "; ".join(summary_bits) if summary_bits else "no blocking security signals"
        )
        return OverallAssessment(
            status=status,
            confidence=round((intent_v.confidence + threat.confidence + risk.confidence) / 3, 3),
            summary=summary.capitalize(),
            recommended_handling=handling,
        )
