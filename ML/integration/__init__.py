"""ML -> Core integration boundary.

This package is ADDITIVE integration glue. It does NOT re-implement any AI logic and
does NOT modify the behavior of existing ML modules. It provides:

- CoreClient: a typed HTTP client for the Core /v1 API (the authorization boundary).
- MLToCoreOrchestrator: connects existing Intent/ActionProposal/SecurityAssessment
  outputs to Core and requests the deterministic decision.

The AI layer is intelligence; the Core is authority. Nothing here authorizes payment,
signs, or touches a chain — it only relays contract objects to Core and returns Core's
deterministic decision.
"""

from integration.core_client import (
    CoreClient,
    CoreClientConfig,
    CoreClientError,
    CoreDecision,
    CoreEnvelopeError,
)
from integration.orchestration import MLToCoreOrchestrator, OrchestrationResult

__all__ = [
    "CoreClient",
    "CoreClientConfig",
    "CoreClientError",
    "CoreEnvelopeError",
    "CoreDecision",
    "MLToCoreOrchestrator",
    "OrchestrationResult",
]
