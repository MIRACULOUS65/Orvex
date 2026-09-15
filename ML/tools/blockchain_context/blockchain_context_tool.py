"""BlockchainContextTool — read-only passthrough of chain context.

The AI service does NOT own or query a blockchain data source (IMPLEMENTATION.md
§14, Requirement 8c.1). Backend/Blockchain supplies normalized context INTO the
request; this tool exposes it to the agent as INTERNAL evidence. It never calls a
chain, signs, or broadcasts.
"""

from __future__ import annotations

import hashlib
import time

from pydantic import BaseModel

from memory.short_term.session_state import ExecutionContext
from tools.base import PermissionLevel, Tool, ToolResult, ToolSpec, TrustLevel


class BlockchainContextInput(BaseModel):
    address: str
    network: str | None = None


class BlockchainContextOutput(BaseModel):
    address: str
    network: str | None
    context: dict  # caller-supplied normalized data (age, tx_count, labels, ...)
    available: bool


class BlockchainContextTool(Tool):
    spec = ToolSpec(
        name="blockchain_context",
        description="Return caller-supplied read-only context about an address.",
        input_schema=BlockchainContextInput,
        output_schema=BlockchainContextOutput,
        permission_level=PermissionLevel.READ_ONLY,
        default_trust_level=TrustLevel.INTERNAL,
        timeout_s=5.0,
        max_retries=0,
    )

    def __init__(self, context_by_address: dict[str, dict] | None = None):
        self._context = context_by_address or {}

    async def run(self, input: BaseModel, *, context: ExecutionContext) -> ToolResult:
        start = time.perf_counter()
        assert isinstance(input, BlockchainContextInput)
        data = self._context.get(input.address, {})
        output = BlockchainContextOutput(
            address=input.address,
            network=input.network,
            context=data,
            available=bool(data),
        )
        digest = hashlib.sha256(output.model_dump_json().encode()).hexdigest()
        return ToolResult(
            output=output,
            trust_level=TrustLevel.INTERNAL,
            source_type="BLOCKCHAIN_CONTEXT",
            content_hash="sha256:" + digest,
            latency_ms=(time.perf_counter() - start) * 1000,
        )
