"""Machine-readable error contract.

Mirrors CONTRACTS.md §44 (shared error categories) and extends with the
AI-specific codes required by PRD_AIML.md. No unhandled exception may reach a
client as a raw traceback (SECURITY_MODEL.md §61) — every failure maps to exactly
one of these codes.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class ErrorCode(str, Enum):
    # ---- Shared (CONTRACTS.md §44) ----
    INVALID_INPUT = "INVALID_INPUT"
    SCHEMA_ERROR = "SCHEMA_ERROR"
    AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR"
    AUTHORIZATION_ERROR = "AUTHORIZATION_ERROR"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    TIMEOUT = "TIMEOUT"
    RATE_LIMITED = "RATE_LIMITED"
    CONFLICT = "CONFLICT"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    # Shared codes that may cross the AI boundary in errors relayed from Core.
    POLICY_VIOLATION = "POLICY_VIOLATION"
    THREAT_DETECTED = "THREAT_DETECTED"
    EXPIRED = "EXPIRED"

    # ---- AI-specific ----
    AI_UNAVAILABLE = "AI_UNAVAILABLE"
    MODEL_OUTPUT_INVALID = "MODEL_OUTPUT_INVALID"
    PROVIDER_ERROR = "PROVIDER_ERROR"
    UNSUPPORTED_MODALITY = "UNSUPPORTED_MODALITY"
    INTENT_NEEDS_CLARIFICATION = "INTENT_NEEDS_CLARIFICATION"
    POLICY_AMBIGUOUS = "POLICY_AMBIGUOUS"
    POLICY_CONFLICT = "POLICY_CONFLICT"
    CONFIGURATION_ERROR = "CONFIGURATION_ERROR"


Severity = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]


class Error(BaseModel):
    """Structured cross-service error (CONTRACTS.md §44 shape)."""

    schema_version: Literal["error.v1"] = "error.v1"
    code: ErrorCode
    message: str
    severity: Severity = "MEDIUM"
    retryable: bool = False
    details: dict = Field(default_factory=dict)
    correlation_id: str | None = None


# ---------------------------------------------------------------------- #
# Exception hierarchy — each carries the code + retryability so the global
# handler can map it deterministically without guesswork.
# ---------------------------------------------------------------------- #
class AIServiceError(Exception):
    """Base for all AI-service errors. Never leaks secrets in its message."""

    code: ErrorCode = ErrorCode.INTERNAL_ERROR
    severity: Severity = "MEDIUM"
    retryable: bool = False
    http_status: int = 500

    def __init__(self, message: str, *, details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def to_error(self, correlation_id: str | None = None) -> Error:
        return Error(
            code=self.code,
            message=self.message,
            severity=self.severity,
            retryable=self.retryable,
            details=self.details,
            correlation_id=correlation_id,
        )


class InvalidInputError(AIServiceError):
    code = ErrorCode.INVALID_INPUT
    http_status = 400


class AIUnavailableError(AIServiceError):
    code = ErrorCode.AI_UNAVAILABLE
    severity = "HIGH"
    retryable = True
    http_status = 503

    def __init__(self, message: str = "All model providers are unavailable.", *, cause=None, details=None):
        super().__init__(message, details=details or ({"cause": str(cause)} if cause else {}))


class ModelOutputInvalidError(AIServiceError):
    code = ErrorCode.MODEL_OUTPUT_INVALID
    severity = "HIGH"
    http_status = 502

    def __init__(self, message: str = "Model output failed schema validation after repair.", *, provider=None, details=None):
        d = details or {}
        if provider:
            d["provider"] = provider
        super().__init__(message, details=d)


class ProviderError(AIServiceError):
    code = ErrorCode.PROVIDER_ERROR
    retryable = True
    http_status = 502


class RateLimitedError(AIServiceError):
    code = ErrorCode.RATE_LIMITED
    retryable = True
    http_status = 429


class TimeoutError_(AIServiceError):
    code = ErrorCode.TIMEOUT
    retryable = True
    http_status = 504


class InsufficientEvidenceError(AIServiceError):
    code = ErrorCode.INSUFFICIENT_EVIDENCE
    http_status = 200  # not an HTTP failure; an explicit analysis outcome


class UnsupportedModalityError(AIServiceError):
    code = ErrorCode.UNSUPPORTED_MODALITY
    http_status = 415


class ConfigurationErrorResponse(AIServiceError):
    code = ErrorCode.CONFIGURATION_ERROR
    severity = "CRITICAL"
    http_status = 500
