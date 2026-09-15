"""Trajectory-context helper for security analysis.

The security layer needs to answer questions like "where was the recipient
introduced?" and "did the final proposal depend on untrusted evidence?"
(WORKFLOW.md §10, PRD_AIML "Trajectory Analysis"). This module provides pure
functions over a trajectory event list to surface those signals deterministically,
before any LLM is involved.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TrajectoryInsights:
    untrusted_event_ids: list[str]
    recipient_change_after_untrusted: bool
    amount_change_after_untrusted: bool
    first_untrusted_sequence: int | None
    proposal_sequence: int | None


def analyze_trajectory(events: list[dict]) -> TrajectoryInsights:
    """Deterministically extract security-relevant structure from a trajectory.

    `events` are TrajectoryEvent dicts (as produced by TrajectoryBuffer).
    """
    untrusted_ids: list[str] = []
    first_untrusted_seq: int | None = None
    proposal_seq: int | None = None
    recipient_change_seq: int | None = None
    amount_change_seq: int | None = None

    for e in events:
        seq = e.get("sequence")
        trust = (e.get("trust_context") or {}).get("trust_level")
        if trust == "UNTRUSTED":
            untrusted_ids.append(e.get("event_id"))
            if first_untrusted_seq is None:
                first_untrusted_seq = seq
        etype = e.get("event_type")
        if etype == "RECIPIENT_CHANGE" and recipient_change_seq is None:
            recipient_change_seq = seq
        if etype == "AMOUNT_CHANGE" and amount_change_seq is None:
            amount_change_seq = seq
        if etype == "PROPOSAL_CREATED":
            proposal_seq = seq

    def _after(change_seq: int | None) -> bool:
        return (
            change_seq is not None
            and first_untrusted_seq is not None
            and change_seq >= first_untrusted_seq
        )

    return TrajectoryInsights(
        untrusted_event_ids=untrusted_ids,
        recipient_change_after_untrusted=_after(recipient_change_seq),
        amount_change_after_untrusted=_after(amount_change_seq),
        first_untrusted_sequence=first_untrusted_seq,
        proposal_sequence=proposal_seq,
    )
