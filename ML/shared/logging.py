"""Structured JSON logging with mandatory secret redaction.

Per SECURITY_MODEL.md §61 and API.md rule set: the service must NEVER log an API
key, private key, auth header, or credential value — including on error paths.
This module provides a JSON formatter and a redaction filter applied to every log
record, plus a helper to bind per-request correlation fields.
"""

from __future__ import annotations

import json
import logging
import re
import sys
from datetime import datetime, timezone
from typing import Any

# Patterns whose *values* must be scrubbed if they ever appear in a log message.
_SENSITIVE_KEY_HINTS = (
    "api_key",
    "apikey",
    "api-key",
    "authorization",
    "auth_token",
    "token",
    "secret",
    "private_key",
    "privatekey",
    "seed",
    "seed_phrase",
    "password",
    "passwd",
    "bearer",
    "cookie",
    "session",
)

# Redact "key=value" / "key: value" / '"key": "value"' occurrences.
_KV_PATTERN = re.compile(
    r'(?i)(["\']?(?:' + "|".join(re.escape(h) for h in _SENSITIVE_KEY_HINTS) + r')["\']?\s*[:=]\s*)'
    r'(["\']?)([^\s,"\'}]+)(\2)'
)

# Redact bearer tokens explicitly.
_BEARER_PATTERN = re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]+")

_REDACTED = "***REDACTED***"


def redact(text: str) -> str:
    """Scrub sensitive key/value pairs and bearer tokens from a string."""
    text = _KV_PATTERN.sub(lambda m: f"{m.group(1)}{m.group(2)}{_REDACTED}{m.group(4)}", text)
    text = _BEARER_PATTERN.sub(f"bearer {_REDACTED}", text)
    return text


class RedactionFilter(logging.Filter):
    """Applies ``redact`` to the rendered message and any string args."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {k: _redact_value(v) for k, v in record.args.items()}
            else:
                record.args = tuple(_redact_value(a) for a in record.args)
        return True


def _redact_value(value: Any) -> Any:
    return redact(value) if isinstance(value, str) else value


# Reserved LogRecord attributes we don't want to duplicate into the JSON "extra".
_RESERVED = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__.keys()) | {
    "message",
    "asctime",
    "taskName",
}


class JsonFormatter(logging.Formatter):
    """Renders each record as a single JSON line, including bound correlation fields."""

    def format(self, record: logging.LogRecord) -> str:
        # ISO-8601 UTC with milliseconds. Built explicitly because strftime has no
        # portable millisecond directive.
        created = datetime.fromtimestamp(record.created, tz=timezone.utc)
        payload: dict[str, Any] = {
            "timestamp": created.strftime("%Y-%m-%dT%H:%M:%S.") + f"{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # Merge structured correlation / context fields passed via `extra=`.
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return redact(json.dumps(payload, default=str))


def configure_logging(level: str = "INFO") -> None:
    """Install the JSON formatter + redaction filter on the root handler."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RedactionFilter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
