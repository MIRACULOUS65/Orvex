"""EIS/provenance stress + fail-closed + insufficient-evidence (SECURITY_MODEL.md
§30-32, §68-72, EVALUATION.md §65-67). Proves 'unknown != safe' and that repetition
is not independence at scale."""

from __future__ import annotations

import pytest

from security.anomaly.detector import AnomalyDetector
from security.graph import SecurityPipeline
from security.provenance.eis import EpistemicIndependenceScorer
from security.reputation.analyzer import ReputationAnalyzer

INTENT = {
    "intent_id": "i", "user_goal": "pay 10 usdc for api", "purpose": "market_data_access",
    "desired_outcome": "api", "budget": {"maximum": "10", "currency": "USDC"},
    "autonomy_level": "AUTOMATIC", "constraints": [],
}
LEGIT = {
    "proposal_id": "p", "intent_id": "i", "action_type": "PAY", "purpose": "market_data_access",
    "recipient": {"type": "SERVICE", "identifier": "ExampleData"}, "amount": {"value": "4.20", "currency": "USDC"},
    "evidence_ids": [],
}


# ---- EIS flood: repetition is not independence, at scale --------------- #


@pytest.mark.parametrize("echo_count", [1, 5, 14, 50, 200])
def test_flood_of_echoes_stays_one_root(echo_count):
    root = {"evidence_id": "root", "source": {"trust_level": "EXTERNAL", "source_type": "FEED"}, "derived_from": []}
    echoes = [
        {"evidence_id": f"e{i}", "source": {"trust_level": "EXTERNAL", "source_type": "FEED"}, "derived_from": ["root"]}
        for i in range(echo_count)
    ]
    res = EpistemicIndependenceScorer().score(alerts=[root, *echoes])
    assert res.raw_alert_count == echo_count + 1
    assert res.independent_root_count == 1
    assert res.recommended_handling == "MONITOR"  # single root never auto-escalates


def test_chained_echoes_collapse_to_one_root():
    # A->B->C->D->E chain: still one independent root.
    alerts = [{"evidence_id": "a", "source": {"trust_level": "EXTERNAL", "source_type": "F"}, "derived_from": []}]
    prev = "a"
    for c in "bcde":
        alerts.append({"evidence_id": c, "source": {"trust_level": "EXTERNAL", "source_type": "F"}, "derived_from": [prev]})
        prev = c
    res = EpistemicIndependenceScorer().score(alerts=alerts)
    assert res.independent_root_count == 1


def test_genuinely_independent_roots_counted():
    alerts = [
        {"evidence_id": f"r{i}", "source": {"trust_level": "TRUSTED", "source_type": "CHAIN"}, "derived_from": []}
        for i in range(5)
    ]
    res = EpistemicIndependenceScorer().score(alerts=alerts)
    assert res.independent_root_count == 5


def test_missing_provenance_treated_as_own_root():
    # Alerts with no derived_from are each their own root (no false collapsing).
    alerts = [
        {"evidence_id": "x", "source": {"trust_level": "UNKNOWN", "source_type": "?"}},
        {"evidence_id": "y", "source": {"trust_level": "UNKNOWN", "source_type": "?"}},
    ]
    res = EpistemicIndependenceScorer().score(alerts=alerts)
    assert res.independent_root_count == 2


def test_empty_alerts_no_crash():
    res = EpistemicIndependenceScorer().score(alerts=[])
    assert res.raw_alert_count == 0
    assert res.independent_root_count == 0


# ---- Fail-closed / unknown != safe ------------------------------------- #


@pytest.mark.asyncio
async def test_no_context_does_not_become_low_risk():
    # No recipient context, no history -> reputation UNAVAILABLE, anomaly INSUFFICIENT.
    a = await SecurityPipeline(provider=None).analyze(
        intent=INTENT, proposal=LEGIT, trajectory=[], evidence=[],
        recipient_context=None, historical_behavior=None,
    )
    assert a.reputation_assessment.data_quality == "UNAVAILABLE"
    assert a.anomaly_assessment.level == "INSUFFICIENT_EVIDENCE"
    # Must not silently become PROCEED with everything unknown.
    assert a.overall_assessment.recommended_handling in ("REVIEW", "DENY_RECOMMENDED", "MONITOR")


def test_reputation_unknown_not_safe():
    r = ReputationAnalyzer().analyze(None)
    assert r.data_quality == "UNAVAILABLE"
    assert r.score is None  # no fabricated safe score


def test_anomaly_no_baseline_not_low():
    a = AnomalyDetector().analyze(proposal=LEGIT, historical_behavior=None)
    assert a.level == "INSUFFICIENT_EVIDENCE"
    assert a.level != "LOW"


# ---- Confidence != authorization --------------------------------------- #


def test_no_authority_or_confidence_shortcut_in_schema():
    from schemas.security_assessment import OverallAssessment, SecurityAssessment

    for forbidden in ("authorized", "execute", "allow", "approved"):
        assert forbidden not in SecurityAssessment.model_fields
        assert forbidden not in OverallAssessment.model_fields
