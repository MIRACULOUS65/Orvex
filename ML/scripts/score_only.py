"""Run the REAL ML security pipeline up to the risk score, then STOP.

Drives the same intent + proposal used in the blockchain end-to-end (pay 1 USDC to
0x3bE3f...7151 on base-sepolia) through the live SecurityPipeline (intent verification ->
threat -> reputation -> anomaly -> RISK -> explanation) and prints the generated
assessment. No Core, no policy, no decision, no payment. Scores are produced by the real
provider(s) configured in ML/.env.local.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys

# Ensure the ML package root (this file's parent's parent) is importable regardless of
# how the script is launched. Running `python scripts\score_only.py` puts `scripts\` on
# sys.path, NOT `ML\`, so `config`/`security`/`models` would not resolve without this.
_ML_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ML_ROOT not in sys.path:
    sys.path.insert(0, _ML_ROOT)

# Load ML/.env.local so provider keys are available.
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv(os.path.join(_ML_ROOT, ".env.local"))
except Exception:
    pass

from config.settings import get_config
from models.provider.factory import build_router
from security.graph import SecurityPipeline


INTENT = {
    "intent_id": "intent_score_demo",
    "agent_id": "agent_demo",
    "user_goal": "Pay 1 USDC to the API provider to renew the subscription.",
    "purpose": "renew subscription",
    "desired_outcome": "subscription renewed",
    "valid_from": "2026-09-11T00:00:00Z",
    "valid_until": "2026-12-30T00:00:00Z",
    "created_at": "2026-09-11T00:00:00Z",
}

PROPOSAL = {
    "proposal_id": "proposal_score_demo",
    "intent_id": "intent_score_demo",
    "agent_id": "agent_demo",
    "action_type": "PAY",
    "purpose": "renew subscription",
    "amount": {"value": "1.00", "currency": "USDC"},
    "recipient": {"type": "SERVICE", "address": "0x3bE3f44cCFF04b0DBe03ADe00710f35eBc387151", "network": "base-sepolia"},
    "network": "base-sepolia",
    "created_at": "2026-09-11T12:00:00Z",
}


async def main() -> None:
    provider = None
    try:
        config = get_config()
        provider = build_router(config)
        print(f"[score-only] provider chain: {[p.name for p in provider._providers]}")
    except Exception as exc:  # if router can't init, pipeline nodes fail closed
        print(f"[score-only] provider init note: {type(exc).__name__}: {exc}")

    pipeline = SecurityPipeline(provider=provider)
    print("[score-only] running REAL security pipeline (intent -> threat -> reputation -> anomaly -> RISK) ...")
    assessment = await pipeline.analyze(intent=INTENT, proposal=PROPOSAL)

    a = assessment.model_dump()
    print("\n===== LIVE ML SECURITY ASSESSMENT =====")
    print(f"assessment_id      : {a['assessment_id']}")
    print(f"proposal_id        : {a['proposal_id']}")
    iv = a["intent_verification"]
    print(f"intent_verification: status={iv['status']} match={iv['intent_match']} score={iv['score']} confidence={iv['confidence']}")
    th = a["threat_assessment"]
    print(f"threat_assessment  : detected={th['detected']} severity={th.get('severity')} confidence={th['confidence']} handling={th.get('recommended_handling')}")
    rep = a["reputation_assessment"]
    print(f"reputation         : level={rep['level']} confidence={rep['confidence']} data_quality={rep.get('data_quality')}")
    an = a["anomaly_assessment"]
    print(f"anomaly            : level={an['level']} confidence={an['confidence']}")
    rk = a["risk_assessment"]
    print(f"RISK               : level={rk['level']} score={rk.get('score')} confidence={rk['confidence']}")
    ov = a["overall_assessment"]
    print(f"overall            : status={ov['status']} confidence={ov['confidence']} recommended_handling={ov['recommended_handling']}")
    print(f"summary            : {ov['summary']}")
    print("=======================================\n")
    print("SCORE_ONLY_OK (stopped after risk score — no Core, no policy, no decision, no payment)")

    # Full JSON for the record.
    print("\n----- FULL ASSESSMENT JSON -----")
    print(json.dumps(a, indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(main())
