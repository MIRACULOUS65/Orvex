"""FastAPI application factory for the SentinelPay AI/ML subsystem.

Wires configuration, logging, tracing, correlation, timeout, error handling, and
routes. The gateway is the ONLY externally reachable surface. It is NOT the
authorization layer — it validates, correlates, routes, and normalizes errors.

Provider selection: in Phase 1 only the MockProvider is available; the full
ProviderRouter/factory is introduced in Phase 3. ``get_primary_provider`` returns
the currently-selected provider for readiness checks.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from config.settings import get_config
from gateway.middleware.correlation import correlation_context
from gateway.middleware.error_handling import register_exception_handlers
from gateway.middleware.timeout import TimeoutMiddleware
from gateway.routes import agent as agent_routes
from gateway.routes import intent as intent_routes
from gateway.routes import policy as policy_routes
from gateway.routes import proposal as proposal_routes
from gateway.routes import rag as rag_routes
from gateway.routes import security as security_routes
from gateway.routes import system as system_routes
from models.provider.factory import build_router
from models.provider.router import ProviderRouter
from shared.logging import configure_logging, get_logger
from shared.tracing import configure_tracing

logger = get_logger("gateway.app")

# The active ProviderRouter, built at startup by the factory (models/provider/factory.py).
# Downstream code depends on the router's generate/generate_structured interface,
# which matches ModelProvider — so callers are provider-agnostic.
_provider_router: ProviderRouter | None = None


def get_primary_provider() -> ProviderRouter | None:
    """Return the active provider router (used by routes and readiness checks).

    Named 'primary' for historical reasons; it is the full fallback chain.
    """
    return _provider_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    config = get_config()
    configure_logging()
    config.validate_required_for_mode()  # fail closed if creds missing for the mode
    configure_tracing(config)

    global _provider_router
    _provider_router = build_router(config)

    logger.info(
        "ai service started",
        extra={
            "environment": config.ai_environment.value,
            "provider_chain": [p.name for p in _provider_router.providers],
        },
    )
    yield
    logger.info("ai service stopping")


def create_app() -> FastAPI:
    config = get_config()
    app = FastAPI(
        title="SentinelPay AI/ML Subsystem",
        description="Intelligence layer. Understands, reasons, proposes, verifies. Never authorizes money.",
        version=config.service_version,
        lifespan=lifespan,
    )

    # Middleware
    app.add_middleware(TimeoutMiddleware, timeout_s=config.request_timeout_s)

    # Correlation context is attached per-request via dependency; also ensure
    # request.state.context exists for middleware by running the dependency early.
    @app.middleware("http")
    async def _attach_context(request, call_next):
        await correlation_context(request)
        return await call_next(request)

    # Exception handlers
    register_exception_handlers(app)

    # Routes
    app.include_router(system_routes.router)
    app.include_router(intent_routes.router)
    app.include_router(agent_routes.router)
    app.include_router(policy_routes.router)
    app.include_router(security_routes.router)
    app.include_router(proposal_routes.router)
    app.include_router(rag_routes.router)

    return app


app = create_app()
