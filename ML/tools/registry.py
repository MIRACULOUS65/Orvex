"""ToolRegistry — typed tool registration + secured invocation.

Security invariants enforced here:
- At registration, a tool whose output_schema declares a forbidden authority field
  (authorized/allow/execute/...) is REJECTED (Requirement 4.4, SECURITY_MODEL.md §26/§80).
- Every invocation emits exactly one TrajectoryEvent, including on failure
  (Requirement 4.6), with the tool's trust level attached.
- Timeouts + bounded retries; a failure is recorded, never silently dropped (4.5).
"""

from __future__ import annotations

import asyncio
import hashlib
import json

from pydantic import BaseModel

from memory.short_term.session_state import ExecutionContext, TrajectoryBuffer
from schemas.trajectory import TrustContext
from shared.logging import get_logger
from tools.base import (
    FORBIDDEN_OUTPUT_FIELDS,
    Tool,
    ToolResult,
    TrustLevel,
)

logger = get_logger("tools.registry")


class ToolRegistrationError(RuntimeError):
    pass


def _content_hash(payload: object) -> str:
    return "sha256:" + hashlib.sha256(
        json.dumps(payload, sort_keys=True, default=str).encode()
    ).hexdigest()


class ToolRegistry:
    def __init__(self, tool_timeout_s: float = 15.0):
        self._tools: dict[str, Tool] = {}
        self._default_timeout = tool_timeout_s

    def register(self, tool: Tool) -> None:
        self._assert_no_authority_fields(tool)
        self._tools[tool.spec.name] = tool
        logger.info("tool registered", extra={"tool": tool.spec.name})

    @staticmethod
    def _assert_no_authority_fields(tool: Tool) -> None:
        fields = set(tool.spec.output_schema.model_fields.keys())
        offending = fields & FORBIDDEN_OUTPUT_FIELDS
        if offending:
            raise ToolRegistrationError(
                f"Tool '{tool.spec.name}' output schema declares forbidden authority "
                f"field(s) {sorted(offending)}. Tool output is evidence, never "
                "authorization. Registration rejected."
            )

    def get(self, name: str) -> Tool:
        if name not in self._tools:
            raise KeyError(f"Unknown tool: {name}")
        return self._tools[name]

    def has(self, name: str) -> bool:
        return name in self._tools

    def list_specs(self) -> list[dict]:
        return [
            {
                "name": t.spec.name,
                "description": t.spec.description,
                "permission_level": t.spec.permission_level.value,
            }
            for t in self._tools.values()
        ]

    async def call(
        self,
        name: str,
        input: BaseModel,
        *,
        context: ExecutionContext,
        trajectory: TrajectoryBuffer,
    ) -> ToolResult:
        """Invoke a tool with timeout+retry and record a TrajectoryEvent."""
        tool = self.get(name)
        timeout = tool.spec.timeout_s or self._default_timeout

        # Record the call intent first (TOOL_CALL).
        trajectory.append(
            event_type="TOOL_CALL",
            action={"tool": name, "input": input.model_dump()},
            input_ref=_content_hash(input.model_dump()),
        )

        attempts = tool.spec.max_retries + 1
        last_error: Exception | None = None
        for attempt in range(attempts):
            try:
                result = await asyncio.wait_for(
                    tool.run(input, context=context), timeout=timeout
                )
                trajectory.append(
                    event_type="TOOL_RESULT",
                    action={"tool": name, "trust_level": result.trust_level.value},
                    output_ref=result.content_hash,
                    trust_context=TrustContext(
                        source_type=result.source_type,
                        trust_level=result.trust_level.value,
                    ),
                )
                return result
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if attempt < attempts - 1:
                    await asyncio.sleep(min(2**attempt * 0.2, 2.0))

        # All attempts failed — record the failure, never silently omit it.
        trajectory.append(
            event_type="TOOL_ERROR",
            action={"tool": name, "error": type(last_error).__name__},
            trust_context=TrustContext(source_type=name, trust_level="UNKNOWN"),
        )
        return ToolResult(
            output=_ErrorOutput(error=str(last_error)),
            trust_level=TrustLevel.UNKNOWN,
            source_type=name,
            content_hash=_content_hash({"error": str(last_error)}),
            latency_ms=0.0,
            error=str(last_error),
        )


class _ErrorOutput(BaseModel):
    error: str
