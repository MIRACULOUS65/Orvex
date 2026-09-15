"""System routes: /health, /ready, /version, /metrics (Requirements 1.2-1.5)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from config.settings import AppConfig, get_config
from gateway.health.checks import liveness, readiness

router = APIRouter(tags=["system"])


def _config() -> AppConfig:
    return get_config()


@router.get("/health")
async def health() -> dict:
    """Liveness — process is up. No external dependency checks."""
    return liveness()


@router.get("/ready")
async def ready(config: AppConfig = Depends(_config)) -> Response:
    """Readiness — reflects provider/vector-store health (always ready in MOCK)."""
    from gateway.app import get_primary_provider  # late import to avoid cycle

    report = await readiness(config, get_primary_provider())
    status_code = 200 if report.ready else 503
    body = {"ready": report.ready, "checks": report.checks}
    return Response(
        content=__import__("json").dumps(body),
        media_type="application/json",
        status_code=status_code,
    )


@router.get("/version")
async def version(config: AppConfig = Depends(_config)) -> dict:
    """Service, schema, and active model/provider identifiers."""
    return {
        "service": "sentinelpay-ai",
        "service_version": config.service_version,
        "environment": config.ai_environment.value,
        "configuration_version": config.configuration_version,
        "schema_versions": {
            "envelope": "envelope.v1",
            "intent": "intent.v1",
            "action_proposal": "action_proposal.v1",
            "security_assessment": "security_assessment.v1",
            "error": "error.v1",
        },
        "provider_chain": config.provider_chain,
    }


@router.get("/metrics")
async def metrics(config: AppConfig = Depends(_config)) -> Response:
    """Prometheus-compatible exposition (Requirement 1.5).

    Minimal placeholder exposition in Phase 1; expanded once OTEL metrics are
    wired. Returns 404-equivalent empty body when telemetry is disabled outside
    hosted/production, but we always expose the endpoint for probe simplicity.
    """
    lines = [
        "# HELP sentinelpay_ai_up Service liveness (1 = up).",
        "# TYPE sentinelpay_ai_up gauge",
        "sentinelpay_ai_up 1",
    ]
    return Response(content="\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")
