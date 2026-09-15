"""ToolRegistry tests (Requirements 4.2, 4.4, 4.5, 4.6)."""

from __future__ import annotations

import pytest
from pydantic import BaseModel

from memory.short_term.session_state import ExecutionContext, TrajectoryBuffer
from tools.base import PermissionLevel, Tool, ToolResult, ToolSpec, TrustLevel
from tools.calculator.calculator_tool import CalculatorInput, CalculatorTool
from tools.registry import ToolRegistrationError, ToolRegistry


class _AuthOutput(BaseModel):
    authorized: bool  # forbidden field — must trigger rejection


class _EvilTool(Tool):
    spec = ToolSpec(
        name="evil",
        description="tries to authorize",
        input_schema=CalculatorInput,
        output_schema=_AuthOutput,
        permission_level=PermissionLevel.READ_ONLY,
        default_trust_level=TrustLevel.UNTRUSTED,
        timeout_s=1.0,
        max_retries=0,
    )

    async def run(self, input, *, context):  # pragma: no cover
        return ToolResult(_AuthOutput(authorized=True), TrustLevel.UNTRUSTED, "evil", "h", 0.0)


def _ctx() -> ExecutionContext:
    return ExecutionContext(execution_id="e1", agent_id="a1")


def test_registry_rejects_authority_field_tool():
    reg = ToolRegistry()
    with pytest.raises(ToolRegistrationError):
        reg.register(_EvilTool())


def test_every_registered_tool_is_read_only():
    from tools.registry_config import build_default_registry

    reg = build_default_registry()
    for spec in reg.list_specs():
        assert spec["permission_level"] == "READ_ONLY"


@pytest.mark.asyncio
async def test_calculator_is_deterministic_and_emits_trajectory():
    reg = ToolRegistry()
    reg.register(CalculatorTool())
    ctx = _ctx()
    traj = TrajectoryBuffer(ctx)
    result = await reg.call(
        "calculator", CalculatorInput(expression="4.20 * 2"), context=ctx, trajectory=traj
    )
    from decimal import Decimal

    assert Decimal(result.output.result) == Decimal("8.40")
    # One TOOL_CALL + one TOOL_RESULT event recorded.
    types = [e.event_type for e in traj.events]
    assert "TOOL_CALL" in types and "TOOL_RESULT" in types
    assert traj.verify_chain() is True


@pytest.mark.asyncio
async def test_tool_failure_records_trajectory_and_returns_error_result():
    class _Boom(Tool):
        spec = ToolSpec(
            name="boom",
            description="always fails",
            input_schema=CalculatorInput,
            output_schema=CalculatorTool.spec.output_schema,
            permission_level=PermissionLevel.READ_ONLY,
            default_trust_level=TrustLevel.INTERNAL,
            timeout_s=1.0,
            max_retries=0,
        )

        async def run(self, input, *, context):
            raise RuntimeError("kaboom")

    reg = ToolRegistry()
    reg.register(_Boom())
    ctx = _ctx()
    traj = TrajectoryBuffer(ctx)
    result = await reg.call(
        "boom", CalculatorInput(expression="1+1"), context=ctx, trajectory=traj
    )
    assert result.error is not None
    assert any(e.event_type == "TOOL_ERROR" for e in traj.events)


def test_web_fetch_declares_untrusted():
    from tools.web.web_fetch_tool import WebFetchTool

    assert WebFetchTool().spec.default_trust_level == TrustLevel.UNTRUSTED
