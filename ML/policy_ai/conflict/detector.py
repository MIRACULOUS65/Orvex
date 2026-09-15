"""Deterministic policy-conflict detection.

Detects contradictory required_action for the same rule type/target
(Requirement 7.4, IMPLEMENTATION.md §9.2). Example: one rule says always auto-pay
invoices (ALLOW) while another says never pay invoices without approval
(REQUIRE_APPROVAL) for the same category.
"""

from __future__ import annotations

from schemas.policy_candidate import PolicyConflict, PolicyRule

# Actions that contradict each other when they apply to the same target.
_CONTRADICTORY = {
    frozenset({"ALLOW", "DENY"}),
    frozenset({"ALLOW", "REQUIRE_APPROVAL"}),
    frozenset({"ALLOW", "REVIEW"}),
}


def _target_key(rule: PolicyRule) -> str:
    """A coarse key identifying what a rule applies to (category/recipient scope)."""
    cond = rule.condition or {}
    category = cond.get("category") or cond.get("categories")
    field = rule.constraint.field or ""
    return f"{rule.type}:{category}:{field}"


def detect_conflicts(rules: list[PolicyRule]) -> list[PolicyConflict]:
    conflicts: list[PolicyConflict] = []
    by_target: dict[str, list[PolicyRule]] = {}
    for rule in rules:
        by_target.setdefault(_target_key(rule), []).append(rule)

    for target, group in by_target.items():
        if len(group) < 2:
            continue
        actions = {r.required_action for r in group}
        for pair in _CONTRADICTORY:
            if pair <= actions:
                conflicts.append(
                    PolicyConflict(
                        rule_ids=[r.rule_id for r in group],
                        reason=(
                            f"Rules for target '{target}' specify contradictory actions "
                            f"{sorted(actions)}."
                        ),
                    )
                )
                break
    return conflicts
