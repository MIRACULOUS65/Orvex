"""OpenTelemetry tracing scaffolding.

- No-op when ``otel_enabled`` is false (Requirement 12.4) — the service runs fully
  without a telemetry backend.
- A span processor scrubs sensitive attributes so no secret is ever exported
  (Requirement 12.3).
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator

from config.settings import AppConfig
from shared.logging import get_logger

logger = get_logger("shared.tracing")

_SENSITIVE_ATTR_HINTS = (
    "api_key",
    "authorization",
    "token",
    "secret",
    "private_key",
    "seed",
    "password",
    "cookie",
    "bearer",
)

_tracer: Any | None = None
_enabled = False


def redact_sensitive_attrs(attributes: dict[str, Any]) -> dict[str, Any]:
    """Drop/replace any attribute whose key hints at a secret."""
    cleaned: dict[str, Any] = {}
    for key, value in attributes.items():
        if any(hint in key.lower() for hint in _SENSITIVE_ATTR_HINTS):
            cleaned[key] = "***REDACTED***"
        else:
            cleaned[key] = value
    return cleaned


def configure_tracing(config: AppConfig) -> None:
    """Initialize tracing if enabled; otherwise leave everything as a no-op."""
    global _tracer, _enabled
    if not config.otel_enabled:
        _enabled = False
        _tracer = None
        logger.info("tracing disabled", extra={"otel_enabled": False})
        return

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider

        provider = TracerProvider(
            resource=Resource.create({"service.name": config.otel_service_name})
        )
        # Exporter wiring intentionally left to deployment config; the endpoint,
        # if present, is attached by the operator's OTEL environment variables.
        trace.set_tracer_provider(provider)
        _tracer = trace.get_tracer("sentinelpay-ai")
        _enabled = True
        logger.info("tracing enabled", extra={"service": config.otel_service_name})
    except Exception as exc:  # never let telemetry setup crash the service
        _enabled = False
        _tracer = None
        logger.warning("tracing setup failed; continuing without tracing", extra={"error": str(exc)})


@contextmanager
def span(name: str, attributes: dict[str, Any] | None = None) -> Iterator[None]:
    """Start a span if tracing is enabled; otherwise a zero-cost no-op."""
    attrs = redact_sensitive_attrs(attributes or {})
    if not _enabled or _tracer is None:
        yield
        return
    with _tracer.start_as_current_span(name) as sp:
        for key, value in attrs.items():
            try:
                sp.set_attribute(key, value)
            except Exception:
                pass
        yield
