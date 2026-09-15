"""Default tool registration.

Builds a ToolRegistry with the standard read-only tool set. Optional backends
(search results, blockchain context) can be injected per request/demo.
"""

from __future__ import annotations

from tools.blockchain_context.blockchain_context_tool import BlockchainContextTool
from tools.calculator.calculator_tool import CalculatorTool
from tools.registry import ToolRegistry
from tools.search.search_tool import SearchBackend, SearchTool
from tools.web.web_fetch_tool import WebFetchTool


def build_default_registry(
    *,
    tool_timeout_s: float = 15.0,
    search_backend: SearchBackend | None = None,
    blockchain_context: dict[str, dict] | None = None,
    retriever=None,
) -> ToolRegistry:
    registry = ToolRegistry(tool_timeout_s=tool_timeout_s)
    registry.register(SearchTool(backend=search_backend))
    registry.register(WebFetchTool())
    registry.register(CalculatorTool())
    registry.register(BlockchainContextTool(context_by_address=blockchain_context))
    if retriever is not None:
        from tools.retrieval.retrieval_tool import RetrievalTool

        registry.register(RetrievalTool(retriever))
    return registry
