"""CalculatorTool — deterministic arithmetic. NOT an LLM call.

Per PRD_AIML "amount calculation -> normal code". Uses Decimal for exact money math.
Supports a tiny safe expression grammar (numbers + - * / and parentheses).
"""

from __future__ import annotations

import ast
import operator
import time
from decimal import Decimal

from pydantic import BaseModel

from memory.short_term.session_state import ExecutionContext
from tools.base import PermissionLevel, Tool, ToolResult, ToolSpec, TrustLevel

_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.USub: operator.neg,
}


class CalculatorInput(BaseModel):
    expression: str


class CalculatorOutput(BaseModel):
    result: str  # decimal string


def _eval(node: ast.AST) -> Decimal:
    if isinstance(node, ast.Constant):
        return Decimal(str(node.value))
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval(node.left), _eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval(node.operand))
    raise ValueError("Unsupported expression")


class CalculatorTool(Tool):
    spec = ToolSpec(
        name="calculator",
        description="Evaluate an exact arithmetic expression (Decimal math).",
        input_schema=CalculatorInput,
        output_schema=CalculatorOutput,
        permission_level=PermissionLevel.READ_ONLY,
        default_trust_level=TrustLevel.INTERNAL,
        timeout_s=2.0,
        max_retries=0,
    )

    async def run(self, input: BaseModel, *, context: ExecutionContext) -> ToolResult:
        start = time.perf_counter()
        assert isinstance(input, CalculatorInput)
        tree = ast.parse(input.expression, mode="eval")
        value = _eval(tree.body)
        output = CalculatorOutput(result=str(value))
        return ToolResult(
            output=output,
            trust_level=TrustLevel.INTERNAL,
            source_type="calculator",
            content_hash="sha256:" + str(value),
            latency_ms=(time.perf_counter() - start) * 1000,
        )
