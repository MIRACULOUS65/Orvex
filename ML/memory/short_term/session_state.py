"""Short-term session state: ExecutionContext and the hash-chained TrajectoryBuffer.

The AI service PRODUCES well-formed, tamper-evident trajectory events; long-term
storage is owned by Core (IMPLEMENTATION.md §33). The buffer builds the hash chain
in-request and is returned alongside the primary response.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from schemas.trajectory import EventType, TrajectoryEvent, TrustContext

_GENESIS_HASH = "0x" + "0" * 64


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash(*parts: str) -> str:
    h = hashlib.sha256("|".join(parts).encode()).hexdigest()
    return f"0x{h}"


@dataclass
class ExecutionContext:
    """Root context for one agent task execution. Threaded through the graph."""

    execution_id: str
    agent_id: str
    intent_id: str | None = None
    tenant_id: str | None = None
    correlation_id: str | None = None
    trace_id: str = field(default_factory=lambda: f"trace_{uuid.uuid4().hex[:12]}")
    max_iterations: int = 4


class TrajectoryBuffer:
    """Append-only, hash-chained sequence of trajectory events for one execution."""

    def __init__(self, context: ExecutionContext):
        self._context = context
        self._events: list[TrajectoryEvent] = []

    @property
    def events(self) -> list[TrajectoryEvent]:
        return list(self._events)

    @property
    def event_ids(self) -> list[str]:
        return [e.event_id for e in self._events]

    def _last_hash(self) -> str:
        return self._events[-1].event_hash if self._events else _GENESIS_HASH

    def append(
        self,
        *,
        event_type: EventType,
        action: dict | None = None,
        input_ref: str | None = None,
        output_ref: str | None = None,
        trust_context: TrustContext | None = None,
    ) -> TrajectoryEvent:
        sequence = len(self._events)
        timestamp = _now_iso()
        event_id = f"trajectory_{uuid.uuid4().hex[:12]}"
        prev = self._last_hash()
        event_hash = _hash(
            self._context.trace_id,
            str(sequence),
            event_type,
            json.dumps(action or {}, sort_keys=True, default=str),
            prev,
        )
        event = TrajectoryEvent(
            event_id=event_id,
            trace_id=self._context.trace_id,
            sequence=sequence,
            timestamp=timestamp,
            agent_id=self._context.agent_id,
            event_type=event_type,
            action=action or {},
            input_ref=input_ref,
            output_ref=output_ref,
            trust_context=trust_context,
            previous_event_hash=prev,
            event_hash=event_hash,
        )
        self._events.append(event)
        return event

    def verify_chain(self) -> bool:
        """Recompute the chain to confirm it has not been tampered with."""
        prev = _GENESIS_HASH
        for i, e in enumerate(self._events):
            if e.previous_event_hash != prev:
                return False
            expected = _hash(
                e.trace_id,
                str(i),
                e.event_type,
                json.dumps(e.action, sort_keys=True, default=str),
                prev,
            )
            if e.event_hash != expected:
                return False
            prev = e.event_hash
        return True
