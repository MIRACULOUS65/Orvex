"""Policy normalizer — canonicalizes units, currency, and enum casing."""

from __future__ import annotations

import uuid

from schemas.policy_candidate import PolicyRule


def normalize_rules(raw_rules: list[dict]) -> list[PolicyRule]:
    """Turn loosely-shaped LLM rule dicts into validated PolicyRule objects.

    Assigns stable rule_ids, upper-cases enums, and drops rules the model emitted
    with an unknown type rather than guessing.
    """
    normalized: list[PolicyRule] = []
    for i, raw in enumerate(raw_rules):
        if not isinstance(raw, dict):
            continue
        rule_type = str(raw.get("type", "")).upper().strip()
        constraint = raw.get("constraint", {}) or {}
        if isinstance(constraint.get("operator"), str):
            constraint["operator"] = constraint["operator"].upper()
        if isinstance(constraint.get("currency"), str):
            constraint["currency"] = constraint["currency"].upper()
        try:
            rule = PolicyRule(
                rule_id=raw.get("rule_id") or f"rule_{i + 1:03d}_{uuid.uuid4().hex[:6]}",
                type=rule_type,  # validated against Literal; invalid -> ValidationError
                condition=raw.get("condition", {}) or {},
                constraint=constraint,
                required_action=str(raw.get("required_action", "ALLOW")).upper(),
                priority=int(raw.get("priority", 100)),
                enabled=bool(raw.get("enabled", True)),
            )
            normalized.append(rule)
        except Exception:
            # Unknown/invalid rule type — skip rather than fabricate a rule.
            continue
    return normalized
