"""Service-to-service authentication (Requirement 11.3, API.md §18).

Core authenticates to the AI service with a shared INTERNAL_SERVICE_TOKEN in
non-mock deployments. In MOCK/LOCAL/dev the check is relaxed so the service is
trivially runnable offline. Possession of this token authenticates a caller — it
does NOT grant any financial authority (that is Core/policy's domain).
"""

from __future__ import annotations

from fastapi import Header, HTTPException

from config.settings import AIEnvironment, get_config


async def require_service_auth(authorization: str | None = Header(default=None)) -> None:
    config = get_config()
    # Relaxed in local/dev/mock so the service runs offline without secrets.
    if config.ai_environment in (AIEnvironment.MOCK, AIEnvironment.LOCAL):
        return
    expected = config.internal_service_token
    if not expected:
        # No token configured in a hosted/prod deployment: fail closed on auth.
        raise HTTPException(status_code=500, detail="Service auth token not configured.")
    provided = (authorization or "").removeprefix("Bearer ").strip()
    if provided != expected:
        raise HTTPException(status_code=401, detail="Invalid service credentials.")
