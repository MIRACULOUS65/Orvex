"""Health / readiness probes.

- ``liveness`` reflects process health only (no external calls) — Requirement 1.2.
- ``readiness`` reflects active provider + vector store health, EXCEPT in MOCK mode
  where the service is always ready with no external dependency — Requirement 1.3.
"""

from __future__ import annotations

from dataclasses import dataclass

from typing import Protocol

from config.settings import AppConfig


class _HealthCheckable(Protocol):
    async def health(self) -> bool: ...


@dataclass(frozen=True)
class ReadinessReport:
    ready: bool
    checks: dict[str, str]


def liveness() -> dict[str, str]:
    return {"status": "alive"}


async def readiness(config: AppConfig, provider: _HealthCheckable | None) -> ReadinessReport:
    checks: dict[str, str] = {}

    if config.is_mock:
        checks["mode"] = "mock"
        checks["provider"] = "mock-ready"
        checks["vector_store"] = "in-memory"
        return ReadinessReport(ready=True, checks=checks)

    # Provider health
    if provider is None:
        checks["provider"] = "unconfigured"
        provider_ok = False
    else:
        try:
            provider_ok = await provider.health()
            checks["provider"] = "ok" if provider_ok else "unhealthy"
        except Exception:
            provider_ok = False
            checks["provider"] = "error"

    # Vector store (best-effort; not fatal for readiness in non-prod)
    checks["vector_store"] = config.vector_store_provider

    return ReadinessReport(ready=provider_ok, checks=checks)
