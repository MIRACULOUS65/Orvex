"""Intent Engine — natural language -> structured Intent.

Design (Requirement 2.x, design §B14 Intent):
- The LLM interprets language and proposes structured fields.
- The parser applies DETERMINISTIC post-checks: if a financially material field
  (budget maximum, currency, autonomy) is missing, the Intent is marked
  NEEDS_CLARIFICATION. The parser NEVER invents such a value even if the model did.
- Monetary amounts are decimal strings; the parser validates that the model did not
  return a float-like/invalid amount.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

from models.provider.base import GenerationRequest, ModelProvider
from schemas.intent import Ambiguity, Intent, MoneyLimit
from schemas.model_metadata import ModelMetadata
from shared.logging import get_logger
from shared.prompts import render_prompt

logger = get_logger("agents.intent")

_PROMPT_AREA = "intent"
_PROMPT_VERSION = "v1"

# Financially material fields. If any is unresolved, the intent needs clarification.
_MATERIAL_FIELDS = ("budget.maximum", "budget.currency", "autonomy_level")

_VALID_AUTONOMY = {"MANUAL", "CONDITIONAL", "AUTOMATIC"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _valid_decimal_string(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        Decimal(value)
        return True
    except (InvalidOperation, ValueError):
        return False


class IntentParser:
    """Converts a user goal into a structured, validated Intent."""

    def __init__(self, provider: ModelProvider):
        self._provider = provider

    async def parse(
        self,
        *,
        user_goal: str,
        agent_id: str,
        user_id: str | None = None,
        validity_hours: int = 24,
    ) -> Intent:
        prompt = render_prompt(_PROMPT_AREA, _PROMPT_VERSION, user_goal=user_goal)
        request = GenerationRequest(
            system_prompt=prompt,
            messages=[{"role": "user", "content": user_goal}],
            temperature=0.0,
            prompt_version=_PROMPT_VERSION,
        )
        response = await self._provider.generate_structured(request, Intent)
        raw = response.structured or {}

        intent = self._assemble(
            raw=raw,
            user_goal=user_goal,
            agent_id=agent_id,
            user_id=user_id,
            validity_hours=validity_hours,
            metadata=response.metadata,
        )
        return intent

    # ------------------------------------------------------------------ #
    def _assemble(
        self,
        *,
        raw: dict,
        user_goal: str,
        agent_id: str,
        user_id: str | None,
        validity_hours: int,
        metadata: ModelMetadata,
    ) -> Intent:
        ambiguities: list[Ambiguity] = [
            Ambiguity(field=a["field"], reason=a.get("reason", "unspecified"))
            for a in raw.get("ambiguities", [])
            if isinstance(a, dict) and a.get("field")
        ]

        # --- Budget: validate deterministically; never invent an amount ---
        budget = self._extract_budget(raw.get("budget"), ambiguities)

        # --- Autonomy: only accept a valid enum; otherwise flag ambiguity ---
        autonomy = raw.get("autonomy_level")
        if autonomy not in _VALID_AUTONOMY:
            autonomy = "MANUAL"  # safe default posture, but flagged as ambiguous below
            if not _has_ambiguity(ambiguities, "autonomy_level"):
                ambiguities.append(
                    Ambiguity(
                        field="autonomy_level",
                        reason="Autonomy level was not clearly specified by the user.",
                    )
                )

        # --- Deterministic clarification gate ---
        status = self._determine_status(budget, ambiguities)

        now = datetime.now(timezone.utc)
        return Intent(
            intent_id=f"intent_{uuid.uuid4().hex[:12]}",
            user_id=user_id,
            agent_id=agent_id,
            user_goal=user_goal,
            purpose=str(raw.get("purpose") or "unspecified"),
            desired_outcome=str(raw.get("desired_outcome") or "unspecified"),
            constraints=[str(c) for c in raw.get("constraints", []) if c],
            budget=budget,
            authorized_actions=[str(a) for a in raw.get("authorized_actions", []) if a],
            forbidden_actions=[str(a) for a in raw.get("forbidden_actions", []) if a],
            autonomy_level=autonomy,
            approval_conditions=[str(c) for c in raw.get("approval_conditions", []) if c],
            valid_from=now.isoformat(),
            valid_until=(now + timedelta(hours=validity_hours)).isoformat(),
            status=status,
            confidence=raw.get("confidence"),
            ambiguities=ambiguities,
            created_at=_now_iso(),
        )

    def _extract_budget(
        self, raw_budget: object, ambiguities: list[Ambiguity]
    ) -> MoneyLimit | None:
        if not isinstance(raw_budget, dict):
            # No budget stated. Flag both material budget fields as ambiguous.
            _ensure_ambiguity(ambiguities, "budget.maximum", "No maximum spending amount was supplied.")
            _ensure_ambiguity(ambiguities, "budget.currency", "No currency was supplied.")
            return None

        maximum = raw_budget.get("maximum")
        currency = raw_budget.get("currency")

        if not _valid_decimal_string(maximum):
            _ensure_ambiguity(
                ambiguities,
                "budget.maximum",
                "No valid maximum amount (decimal string) was supplied; the system will not invent one.",
            )
            maximum = None
        if not currency or not isinstance(currency, str):
            _ensure_ambiguity(ambiguities, "budget.currency", "No currency was supplied.")
            currency = None

        if maximum is None or currency is None:
            return None

        period = raw_budget.get("period")
        if period not in ("daily", "weekly", "monthly", "once", None):
            period = None
        return MoneyLimit(maximum=maximum, currency=currency, period=period)

    def _determine_status(
        self, budget: MoneyLimit | None, ambiguities: list[Ambiguity]
    ) -> str:
        for field in _MATERIAL_FIELDS:
            if _has_ambiguity(ambiguities, field):
                return "NEEDS_CLARIFICATION"
        if budget is None and _has_ambiguity(ambiguities, "budget.maximum"):
            return "NEEDS_CLARIFICATION"
        return "VALID"


def _has_ambiguity(ambiguities: list[Ambiguity], field: str) -> bool:
    return any(a.field == field for a in ambiguities)


def _ensure_ambiguity(ambiguities: list[Ambiguity], field: str, reason: str) -> None:
    if not _has_ambiguity(ambiguities, field):
        ambiguities.append(Ambiguity(field=field, reason=reason))
