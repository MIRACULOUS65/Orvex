"""Live two-service ML <-> Core HTTP round-trip.

Starts the REAL services as separate processes and drives the genuine HTTP path:

    Orvex/ML FastAPI (uvicorn, MOCK provider)   -- POST /proposal/analyze
                        |
                        v  (real SecurityAssessment over HTTP)
    AI-side CoreClient  -- POST /v1/intents, /v1/proposals,
                           /v1/proposals/:id/assessments, /v1/decisions
                        |
                        v
    Core Fastify (deterministic authority)      -- ALLOW / REVIEW / DENY

Proves: contracts match across the wire, correlation survives, tenant survives, the
SecurityAssessment is persisted, and Core is the deterministic authority (a compliant
proposal -> ALLOW; an over-limit proposal -> DENY regardless of AI recommendation).

The Core test server seeds a fully-configured company/agent and prints their ids on the
CORE_READY line, so this driver performs a pure HTTP round-trip.

Exit 0 on success, non-zero on failure. Run from Orvex/ML with the venv python.
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

import httpx

ML_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_ROOT.parent
CORE_ROOT = REPO_ROOT / "Backend"

sys.path.insert(0, str(ML_ROOT))

from integration.core_client import CoreClient, CoreClientConfig, RequestContext  # noqa: E402
from integration.orchestration import MLToCoreOrchestrator  # noqa: E402

ML_PORT = 8077
CORE_PORT = 8098


def _wait_http(url: str, timeout_s: float = 60.0) -> None:
    deadline = time.time() + timeout_s
    last = None
    while time.time() < deadline:
        try:
            r = httpx.get(url, timeout=3.0)
            if r.status_code < 500:
                return
        except Exception as exc:  # noqa: BLE001
            last = exc
        time.sleep(0.5)
    raise RuntimeError(f"Service at {url} did not become ready: {last}")


def _load_backend_env() -> dict[str, str]:
    env = dict(os.environ)
    env_file = CORE_ROOT / ".env.local"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env.setdefault(k.strip(), v.strip())
    return env


def _intent(agent_id: str) -> dict:
    return {
        "schema_version": "intent.v1", "intent_id": f"intent_{uuid.uuid4().hex[:8]}", "agent_id": agent_id,
        "user_goal": "pay the monthly API subscription", "purpose": "renew", "desired_outcome": "renewed",
        "valid_from": "2026-09-11T00:00:00Z", "valid_until": "2026-12-30T00:00:00Z", "created_at": "2026-09-11T00:00:00Z",
        "autonomy_level": "CONDITIONAL", "constraints": [], "authorized_actions": ["PAY"], "forbidden_actions": [],
    }


def _proposal(agent_id: str, intent_id: str, *, amount: str, recipient: str) -> dict:
    return {
        "schema_version": "action_proposal.v1", "proposal_id": f"proposal_{uuid.uuid4().hex[:8]}",
        "intent_id": intent_id, "agent_id": agent_id, "action_type": "PAY", "purpose": "renew",
        "amount": {"value": amount, "currency": "USDC"},
        "recipient": {"type": "SERVICE", "address": recipient, "network": "base-sepolia"},
        "network": "base-sepolia", "created_at": "2026-09-11T12:00:00Z", "evidence_ids": [], "trajectory_event_ids": [],
    }


def _ml_analyze(intent: dict, proposal: dict) -> dict:
    r = httpx.post(
        f"http://127.0.0.1:{ML_PORT}/proposal/analyze",
        json={"intent": intent, "proposal": proposal, "trajectory": [], "evidence": []},
        timeout=90.0,
    )
    r.raise_for_status()
    return r.json()["data"]


def main() -> int:
    procs: list[subprocess.Popen] = []
    try:
        backend_env = _load_backend_env()
        if not backend_env.get("DATABASE_URL"):
            print("SKIP: no DATABASE_URL for Core test server", flush=True)
            return 0

        # 1) Start the real Core Fastify server (seeds company/agent, prints ids).
        core = subprocess.Popen(
            ["node", "scripts/serve-test-core.mjs", str(CORE_PORT)],
            cwd=str(CORE_ROOT), env={**backend_env, "CORE_ENV": "test"},
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        procs.append(core)

        company_id = agent_id = None
        deadline = time.time() + 120
        while time.time() < deadline:
            line = core.stdout.readline() if core.stdout else ""
            if line:
                print(f"[core] {line.rstrip()}", flush=True)
                if line.startswith("CORE_READY"):
                    parts = line.split()
                    company_id, agent_id = parts[3], parts[4]
                    break
                if line.startswith("CORE_FAILED"):
                    raise RuntimeError("Core test server failed to start")
            if core.poll() is not None:
                raise RuntimeError("Core test server exited early")
        if not company_id:
            raise RuntimeError("Core test server not ready in time")

        # 2) Start the real ML FastAPI (MOCK provider, offline-safe).
        ml = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "gateway.app:app", "--host", "127.0.0.1", "--port", str(ML_PORT), "--log-level", "warning"],
            cwd=str(ML_ROOT), env={**os.environ, "AI_ENVIRONMENT": "mock"},
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        procs.append(ml)
        _wait_http(f"http://127.0.0.1:{ML_PORT}/health")
        print("[ml] ready", flush=True)

        client = CoreClient(CoreClientConfig(base_url=f"http://127.0.0.1:{CORE_PORT}", service_token=None, actor_role="ADMIN"))
        ctx = RequestContext(company_id=company_id, actor_id="live-test")
        orch = MLToCoreOrchestrator(client)

        # 3) Compliant proposal: real ML analysis -> Core -> ALLOW.
        intent = _intent(agent_id)
        proposal = _proposal(agent_id, intent["intent_id"], amount="10.00", recipient="0xrecipient")
        assessment = _ml_analyze(intent, proposal)
        print(f"[ml] recommended_handling={assessment['overall_assessment']['recommended_handling']}", flush=True)
        result = orch.run(
            company_id=company_id, agent_id=agent_id, intent=intent, proposal=proposal,
            security_assessment=assessment, correlation_id=ctx.correlation_id,
        )
        print(f"[core] decision={result.decision.result} correlation={result.correlation_id}", flush=True)
        # A compliant proposal is never wrongly DENIED by a hard rule; it is ALLOW, or
        # REVIEW when the AI advisory escalates scrutiny. It must NOT be a hard DENY.
        assert result.decision.result in ("ALLOW", "REVIEW"), f"unexpected {result.decision.result}"
        assert result.correlation_id == ctx.correlation_id, "correlation id did not survive"
        assert result.assessment_row_id, "SecurityAssessment was not persisted"

        # 4) Over-limit proposal: Core must DENY regardless of the AI recommendation. We
        #    force the AI recommendation to the MOST permissive value (broken-AI style)
        #    to prove the deterministic policy still wins.
        over = _proposal(agent_id, intent["intent_id"], amount="500.00", recipient="0xrecipient")
        over_assessment = _ml_analyze(intent, over)
        over_assessment["overall_assessment"]["recommended_handling"] = "PROCEED_CANDIDATE"
        over_assessment["threat_assessment"]["detected"] = False
        over_assessment["risk_assessment"]["level"] = "LOW"
        over_result = orch.run(
            company_id=company_id, agent_id=agent_id, intent=intent, proposal=over, security_assessment=over_assessment,
        )
        print(f"[core] over-limit (AI says PROCEED) decision={over_result.decision.result}", flush=True)
        assert over_result.decision.result == "DENY", f"expected DENY, got {over_result.decision.result}"

        print("LIVE_ROUNDTRIP_OK", flush=True)
        return 0
    except Exception as exc:  # noqa: BLE001
        print(f"LIVE_ROUNDTRIP_FAILED {exc}", flush=True)
        return 1
    finally:
        for p in procs:
            try:
                p.terminate()
                p.wait(timeout=10)
            except Exception:  # noqa: BLE001
                p.kill()


if __name__ == "__main__":
    raise SystemExit(main())
