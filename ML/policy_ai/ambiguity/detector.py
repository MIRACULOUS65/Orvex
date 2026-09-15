"""Deterministic ambiguity detection over policy text + extracted rules.

Complements the LLM's own ambiguity flags with hard pattern checks so the compiler
never silently produces a rule with a missing numeric threshold (Requirement 7.3,
SECURITY_MODEL.md §44 "AI must not silently choose a financial limit").
"""

from __future__ import annotations

import re

from schemas.policy_candidate import PolicyAmbiguity, PolicyRule

# Vague quantity language that implies a limit without stating one.
_VAGUE_PATTERNS = [
    r"\btoo much\b",
    r"\breasonable\b",
    r"\bnot too (?:much|many|high)\b",
    r"\bsensible\b",
    r"\bappropriate amount\b",
    r"\ba lot\b",
    r"\bsmall (?:amount|sum)\b",
    r"\blarge (?:amount|sum)\b",
]

# Rule types that MUST carry a concrete numeric value to be enforceable.
_NUMERIC_RULE_TYPES = {"AMOUNT_LIMIT", "CUMULATIVE_LIMIT"}


def detect_ambiguities(policy_text: str, rules: list[PolicyRule]) -> list[PolicyAmbiguity]:
    found: list[PolicyAmbiguity] = []

    for pattern in _VAGUE_PATTERNS:
        m = re.search(pattern, policy_text, flags=re.IGNORECASE)
        if m:
            found.append(
                PolicyAmbiguity(
                    clause=policy_text[max(0, m.start() - 20) : m.end() + 20].strip(),
                    reason="Vague quantity with no explicit numeric limit; refusing to invent one.",
                )
            )

    for rule in rules:
        if rule.type in _NUMERIC_RULE_TYPES:
            value = rule.constraint.value
            if value is None or (isinstance(value, str) and not value.strip()):
                found.append(
                    PolicyAmbiguity(
                        clause=f"rule {rule.rule_id} ({rule.type})",
                        reason="Numeric limit rule has no concrete value.",
                    )
                )
    return found
