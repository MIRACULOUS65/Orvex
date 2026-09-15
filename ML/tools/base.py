"""Tool system core.

Every tool is READ-ONLY (Requirement 4.2). There is no EXECUTE permission level in
this service by design — the Agent Brain cannot move money. Each tool declares a
typed spec and returns a ToolResult carrying trust level + provenance; the registry
turns each call into a TrajectoryEvent.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum

from pydantic import BaseModel

from memory.short_term.session_state import ExecutionContext


class TrustLevel(str, Enum):
    TRUSTED = "TRUSTED"
    INTERNAL = "INTERNAL"
    EXTERNAL = "EXTERNAL"
    UNTRUSTED = "UNTRUSTED"
    UNKNOWN = "UNKNOWN"


class PermissionLevel(str, Enum):
    # Only READ_ONLY exists. No EXECUTE/WRITE/SIGN level is defined anywhere.
    READ_ONLY = "READ_ONLY"


# Field names that would let a tool masquerade as an authorization source.
FORBIDDEN_OUTPUT_FIELDS = {"authorized", "allow", "execute", "authorization", "approved"}


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    input_schema: type[BaseModel]
    output_schema: type[BaseModel]
    permission_level: PermissionLevel
    default_trust_level: TrustLevel
    timeout_s: float
    max_retries: int


@dataclass(frozen=True)
class ToolResult:
    output: BaseModel
    trust_level: TrustLevel
    source_type: str
    content_hash: str
    latency_ms: float
    error: str | None = None


class Tool(ABC):
    spec: ToolSpec

    @abstractmethod
    async def run(self, input: BaseModel, *, context: ExecutionContext) -> ToolResult:
        """Execute the (read-only) tool and return a provenance-tagged result."""
