"""Evidence schema — mirrors CONTRACTS.md §11/§12.

Evidence is any information used to support an AI/security assessment. It carries
provenance (source, trust_level, derived_from) so the Epistemic Independence layer
can later distinguish genuine independent corroboration from repetition, and so
explanations can cite exactly which evidence supported a conclusion.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

EvidenceTrustLevel = Literal["TRUSTED", "INTERNAL", "EXTERNAL", "UNTRUSTED", "UNKNOWN"]
ContentType = Literal["TEXT", "JSON", "IMAGE", "DOCUMENT", "CHAIN_DATA", "STRUCTURED"]


class EvidenceSource(BaseModel):
    source_id: str
    source_type: str
    trust_level: EvidenceTrustLevel


class Evidence(BaseModel):
    schema_version: Literal["evidence.v1"] = "evidence.v1"
    evidence_id: str
    source: EvidenceSource
    content_type: ContentType = "TEXT"
    content_hash: str
    claim: str | None = None
    raw_reference: str | None = None
    timestamp: str
    derived_from: list[str] = Field(default_factory=list)
    trajectory_event_ids: list[str] = Field(default_factory=list)
