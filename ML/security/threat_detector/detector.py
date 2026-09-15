"""Threat Detector — trajectory-aware manipulation detection.

Consumes the FULL trajectory + evidence, not just the final proposal (Requirement
8b.1). Combines a deterministic pre-scan (untrusted-content-driven recipient/amount
changes, injection keyword patterns) with LLM analysis. The deterministic layer
guarantees payment-redirection is flagged HIGH even if the model misses it
(Requirement 8b.3).
"""

from __future__ import annotations

import json
import re

from memory.retrieval.retrieval_memory import analyze_trajectory
from models.provider.base import GenerationRequest
from models.provider.router import ProviderRouter
from schemas.security_assessment import ThreatAssessment
from shared.logging import get_logger
from shared.prompts import render_prompt

logger = get_logger("security.threat")

_INJECTION_PATTERNS = [
    r"ignore (?:all )?(?:previous|prior) instructions",
    r"disregard (?:the )?(?:above|previous)",
    r"send (?:the )?payment to",
    r"change (?:the )?(?:payment )?(?:address|recipient|wallet)",
    r"new (?:payment )?(?:address|wallet)",
    r"you are now",
    r"system[: ]",
    r"reveal (?:the )?(?:api key|private key|secret|seed)",
    r"send (?:your|the) (?:api key|private key|seed)",
    r"(?:private key|api key|seed phrase|secret key|wallet seed)",
    r"(?:reveal|return|share|provide|send)\b.{0,30}\b(?:key|seed|secret|password|credential)",
]


class ThreatDetector:
    def __init__(self, provider: ProviderRouter | None = None):
        self._provider = provider

    async def analyze(
        self,
        *,
        intent: dict,
        proposal: dict,
        trajectory: list[dict] | None = None,
        evidence: list[dict] | None = None,
    ) -> ThreatAssessment:
        trajectory = trajectory or []
        evidence = evidence or []

        det = self._deterministic_scan(intent, proposal, trajectory, evidence)

        # Optimization + resilience: if the deterministic scan already found a
        # HIGH/CRITICAL threat (e.g. payment redirection), the decision is settled —
        # skip the (slow, rate-limited) LLM call. It cannot change a HIGH+ outcome
        # and only adds latency under load. The deterministic layer is authoritative
        # for these classes; the LLM only adds coverage for subtler cases.
        llm = None
        deterministic_high = det["severity"] in ("HIGH", "CRITICAL")
        if self._provider is not None and not deterministic_high:
            try:
                llm = await self._llm_scan(intent, proposal, trajectory, evidence)
            except Exception:
                llm = None  # explicit: no fabricated 'clean' result on failure

        return self._merge(det, llm)

    # ------------------------------------------------------------------ #
    def _deterministic_scan(
        self, intent: dict, proposal: dict, trajectory: list[dict], evidence: list[dict]
    ) -> dict:
        categories: set[str] = set()
        evidence_ids: list[str] = []
        traj_ids: list[str] = []
        explanation_bits: list[str] = []

        insights = analyze_trajectory(trajectory)

        # Recipient/amount changed right after untrusted content -> redirection.
        if insights.recipient_change_after_untrusted:
            categories.add("PAYMENT_REDIRECTION")
            categories.add("INDIRECT_PROMPT_INJECTION")
            explanation_bits.append(
                "Recipient changed immediately after untrusted external content."
            )
            traj_ids.extend(insights.untrusted_event_ids)
        if insights.amount_change_after_untrusted:
            categories.add("AMOUNT_MANIPULATION")
            explanation_bits.append("Amount changed after untrusted external content.")

        # Keyword scan over untrusted evidence content.
        for ev in evidence:
            src = ev.get("source", {}) if isinstance(ev.get("source"), dict) else {}
            if src.get("trust_level") == "UNTRUSTED":
                text = " ".join(
                    str(ev.get(k, "")) for k in ("claim", "raw_reference")
                ).lower()
                for pat in _INJECTION_PATTERNS:
                    if re.search(pat, text):
                        categories.add("INDIRECT_PROMPT_INJECTION")
                        if "payment" in pat or "recipient" in pat or "wallet" in pat or "address" in pat:
                            categories.add("PAYMENT_REDIRECTION")
                        if "key" in pat or "secret" in pat or "seed" in pat:
                            categories.add("CREDENTIAL_REQUEST")
                        evidence_ids.append(ev.get("evidence_id"))
                        explanation_bits.append(
                            f"Untrusted content matched injection pattern: '{pat}'."
                        )

        severity = None
        if categories:
            severity = "HIGH" if (
                "PAYMENT_REDIRECTION" in categories or "CREDENTIAL_REQUEST" in categories
            ) else "MEDIUM"

        return {
            "detected": bool(categories),
            "severity": severity,
            "categories": sorted(categories),
            "confidence": 0.9 if categories else 0.5,
            "evidence_ids": [e for e in evidence_ids if e],
            "trajectory_event_ids": [t for t in traj_ids if t],
            "explanation": " ".join(explanation_bits),
        }

    async def _llm_scan(
        self, intent: dict, proposal: dict, trajectory: list[dict], evidence: list[dict]
    ) -> dict:
        prompt = render_prompt(
            "security",
            "threat_v1",
            intent=json.dumps(intent),
            proposal=json.dumps(proposal),
            trajectory=json.dumps(trajectory)[:6000],
            evidence=json.dumps(evidence)[:6000],
        )
        req = GenerationRequest(
            system_prompt=prompt,
            messages=[{"role": "user", "content": "Analyze for threats."}],
            prompt_version="threat_v1",
        )
        resp = await self._provider.generate_structured(req, dict)
        return resp.structured or {}

    def _merge(self, det: dict, llm: dict | None) -> ThreatAssessment:
        categories = set(det["categories"])
        explanation = det["explanation"]
        confidence = det["confidence"]
        severity = det["severity"]

        if llm:
            categories.update(str(c) for c in llm.get("categories", []) if c)
            if llm.get("explanation"):
                explanation = (explanation + " " + str(llm["explanation"])).strip()
            confidence = max(confidence, float(llm.get("confidence", 0.0)))
            llm_sev = llm.get("severity")
            severity = _max_severity(severity, llm_sev)

        detected = bool(categories) or bool(llm and llm.get("detected"))
        # Deterministic hard rule: redirection/credential -> at least HIGH.
        if categories & {"PAYMENT_REDIRECTION", "CREDENTIAL_REQUEST"}:
            severity = _max_severity(severity, "HIGH")

        handling = "MONITOR"
        if severity in ("HIGH", "CRITICAL"):
            handling = "DENY_RECOMMENDED"
        elif severity == "MEDIUM":
            handling = "REVIEW"

        return ThreatAssessment(
            detected=detected,
            severity=severity if detected else None,
            categories=sorted(categories),
            confidence=confidence,
            evidence_ids=det["evidence_ids"],
            trajectory_event_ids=det["trajectory_event_ids"],
            explanation=explanation or ("No manipulation detected." if not detected else ""),
            recommended_handling=handling,
        )


_SEVERITY_ORDER = {None: 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}


def _max_severity(a: str | None, b: str | None) -> str | None:
    if _SEVERITY_ORDER.get(a, 0) >= _SEVERITY_ORDER.get(b, 0):
        return a
    return b
