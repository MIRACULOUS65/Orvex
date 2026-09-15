"""ModelMetadata schema — mirrors CONTRACTS.md §43.

Every AI-generated contract object carries this so results are reproducible and
auditable. Field names/shape match the canonical JSON exactly (Requirement 10.1).
"""

from __future__ import annotations

from pydantic import BaseModel


class ModelMetadata(BaseModel):
    provider: str
    model: str
    model_version: str
    configuration_version: str
    prompt_version: str
    temperature: float = 0.0
    timestamp: str

    # Optional expansion fields noted in CONTRACTS.md §43 (kept optional for fwd-compat).
    system_prompt_hash: str | None = None
    toolset_version: str | None = None
    retrieval_version: str | None = None
    classifier_version: str | None = None
    embedding_model_version: str | None = None
    
