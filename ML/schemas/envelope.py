"""Standard response envelope.

Every route returns this shape (PRD_AIML.md "Backend API Contract"):
    {schema_version, request_id, status, data, error, metadata}
"""

from __future__ import annotations

from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, Field

from .errors import Error

T = TypeVar("T")

EnvelopeStatus = Literal["OK", "ERROR", "NEEDS_CLARIFICATION", "INSUFFICIENT_EVIDENCE"]


class Metadata(BaseModel):
    latency_ms: float | None = None
    model_metadata: dict | None = None
    fallback_used: bool = False
    extra: dict = Field(default_factory=dict)


class Envelope(BaseModel, Generic[T]):
    schema_version: str = "envelope.v1"
    request_id: str
    status: EnvelopeStatus = "OK"
    data: T | None = None
    error: Error | None = None
    metadata: Metadata = Field(default_factory=Metadata)

    @classmethod
    def ok(cls, request_id: str, data: T, *, metadata: Metadata | None = None) -> "Envelope[T]":
        return cls(request_id=request_id, status="OK", data=data, metadata=metadata or Metadata())

    @classmethod
    def failure(cls, request_id: str, error: Error, *, status: EnvelopeStatus = "ERROR") -> "Envelope[T]":
        return cls(request_id=request_id, status=status, error=error)
