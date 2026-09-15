"""Policy validator — re-runs ambiguity + conflict detection on structured rules.

Used by /policy/validate to check an existing structured policy without re-invoking
full NL compilation (Requirement 7.6).
"""

from __future__ import annotations

from policy_ai.ambiguity.detector import detect_ambiguities
from policy_ai.conflict.detector import detect_conflicts
from schemas.policy_candidate import PolicyCandidateResult, PolicyRule


def validate_rules(rules: list[PolicyRule], policy_text: str = "") -> PolicyCandidateResult:
    ambiguities = detect_ambiguities(policy_text, rules)
    conflicts = detect_conflicts(rules)

    if conflicts:
        status = "POLICY_CONFLICT"
    elif ambiguities:
        status = "AMBIGUOUS"
    else:
        status = "OK"

    return PolicyCandidateResult(
        status=status,
        candidate_rules=rules,
        ambiguities=ambiguities,
        conflicts=conflicts,
    )
