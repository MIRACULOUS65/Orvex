"""Helpers for constructing Evidence objects with correct provenance."""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone

from schemas.evidence import ContentType, Evidence, EvidenceSource, EvidenceTrustLevel


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def content_hash(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode()).hexdigest()


def make_evidence(
    *,
    source_id: str,
    source_type: str,
    trust_level: EvidenceTrustLevel,
    content: str,
    claim: str | None = None,
    raw_reference: str | None = None,
    content_type: ContentType = "TEXT",
    derived_from: list[str] | None = None,
    trajectory_event_ids: list[str] | None = None,
) -> Evidence:
    return Evidence(
        evidence_id=f"evidence_{uuid.uuid4().hex[:12]}",
        source=EvidenceSource(
            source_id=source_id, source_type=source_type, trust_level=trust_level
        ),
        content_type=content_type,
        content_hash=content_hash(content),
        claim=claim,
        raw_reference=raw_reference,
        timestamp=_now_iso(),
        derived_from=derived_from or [],
        trajectory_event_ids=trajectory_event_ids or [],
    )
