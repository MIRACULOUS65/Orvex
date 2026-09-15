"""Intent Verifier — is the proposal a faithful fulfillment of the original intent?

DETERMINISTIC-FIRST (design §B13.1, IMPLEMENTATION.md §8): exact checks (budget,
asset, recipient provenance) run BEFORE any LLM call and short-circuit to FAIL.
This is the mechanism that catches payment-redirection even if the threat model is
fooled — a recipient introduced only by untrusted content, and absent from the
original intent, fails deterministically.

Semantic purpose/category alignment (LLM) runs only after deterministic checks pass.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from memory.retrieval.retrieval_memory import analyze_trajectory
from models.provider.base import GenerationRequest
from models.provider.router import ProviderRouter
from schemas.security_assessment import IntentVerificationResult
from shared.logging import get_logger

logger = get_logger("security.intent_verifier")


def _to_decimal(value) -> Decimal | None:
    try:
        d = Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError):
        return None
    # Reject NaN / Infinity — they are "valid" Decimals but not real amounts and
    # raise on comparison. Adversarial inputs like "NaN"/"1e999" must not crash.
    if not d.is_finite():
        return None
    return d


class IntentVerifier:
    def __init__(self, provider: ProviderRouter | None = None):
        self._provider = provider

    async def verify(
        self,
        *,
        intent: dict,
        proposal: dict,
        trajectory: list[dict] | None = None,
        evidence: list[dict] | None = None,
    ) -> IntentVerificationResult:
        trajectory = trajectory or []
        evidence = evidence or []

        det = self._deterministic_checks(intent, proposal, trajectory, evidence)
        if det["hard_fail"]:
            return IntentVerificationResult(
                status="FAIL",
                intent_match=False,
                score=det["score"],
                dimensions=det["dimensions"],
                violations=det["violations"],
                reasons=det["reasons"],
                evidence_ids=det["evidence_ids"],
                confidence=0.95,  # deterministic conclusion — high confidence
            )

        # An incomplete proposal (missing amount/recipient) can never auto-PASS.
        if det.get("incomplete"):
            return IntentVerificationResult(
                status="UNCERTAIN",
                intent_match=False,
                score=det["score"],
                dimensions=det["dimensions"],
                violations=det["violations"],
                reasons=det["reasons"],
                evidence_ids=det["evidence_ids"],
                confidence=0.5,
            )

        # Deterministic checks passed; optionally refine with semantic alignment.
        semantic_score = det["score"]
        reasons = list(det["reasons"])
        if self._provider is not None:
            try:
                semantic = await self._semantic_alignment(intent, proposal)
                semantic_score = min(semantic_score, semantic.get("score", semantic_score))
                if semantic.get("reason"):
                    reasons.append(semantic["reason"])
                if semantic.get("mismatch"):
                    return IntentVerificationResult(
                        status="UNCERTAIN",
                        intent_match=False,
                        score=semantic_score,
                        dimensions=det["dimensions"],
                        violations=det["violations"],
                        reasons=reasons,
                        evidence_ids=det["evidence_ids"],
                        confidence=semantic.get("confidence", 0.6),
                    )
            except Exception:
                # Semantic refinement unavailable. The deterministic checks already
                # PASSED (budget/asset/recipient-provenance all clear), so this is a
                # PASS with reduced confidence — not an UNCERTAIN. The deterministic
                # layer is the authority; the LLM only refines. (A hard-fail case
                # never reaches here — it short-circuits above.)
                return IntentVerificationResult(
                    status="PASS",
                    intent_match=True,
                    score=semantic_score,
                    dimensions=det["dimensions"],
                    reasons=reasons + ["Deterministic checks passed; semantic refinement unavailable."],
                    evidence_ids=det["evidence_ids"],
                    confidence=0.6,
                )

        return IntentVerificationResult(
            status="PASS",
            intent_match=True,
            score=semantic_score,
            dimensions=det["dimensions"],
            reasons=reasons or ["Proposal is consistent with the original intent."],
            evidence_ids=det["evidence_ids"],
            confidence=0.85,
        )

    # ------------------------------------------------------------------ #
    def _deterministic_checks(
        self, intent: dict, proposal: dict, trajectory: list[dict], evidence: list[dict]
    ) -> dict:
        violations: list[str] = []
        reasons: list[str] = []
        dims: dict[str, float] = {}
        evidence_ids: list[str] = []
        hard_fail = False

        # --- Budget check (exact) ---
        budget = intent.get("budget") or {}
        budget_max = _to_decimal(budget.get("maximum"))
        amount = (proposal.get("amount") or {})
        amount_val = _to_decimal(amount.get("value"))
        if budget_max is not None and amount_val is not None:
            if amount_val <= budget_max:
                dims["amount_alignment"] = 1.0
            else:
                dims["amount_alignment"] = 0.0
                violations.append(
                    f"amount {amount_val} exceeds intent budget {budget_max}"
                )
                reasons.append("Proposed amount exceeds the user's stated budget.")
                hard_fail = True
        else:
            dims["amount_alignment"] = 0.5

        # --- Asset check ---
        budget_currency = (budget.get("currency") or "").upper()
        amount_currency = (amount.get("currency") or "").upper()
        if budget_currency and amount_currency:
            dims["asset_alignment"] = 1.0 if budget_currency == amount_currency else 0.3
            # Currency mismatch is a soft signal unless intent forbids substitution.

        # --- Recipient provenance check (catches payment redirection) ---
        insights = analyze_trajectory(trajectory)
        recipient = proposal.get("recipient") or {}
        recipient_addr = (recipient.get("address") or "").lower()
        recipient_id = (recipient.get("identifier") or "").lower()

        # Was the recipient introduced by untrusted content and never in the intent?
        intent_text = " ".join(
            str(v)
            for v in (
                intent.get("user_goal", ""),
                intent.get("purpose", ""),
                intent.get("desired_outcome", ""),
                " ".join(intent.get("constraints", []) or []),
            )
        ).lower()

        recipient_in_intent = bool(
            (recipient_id and recipient_id in intent_text)
            or (recipient_addr and recipient_addr in intent_text)
        )

        if insights.recipient_change_after_untrusted and not recipient_in_intent:
            dims["recipient_alignment"] = 0.0
            violations.append("recipient introduced by untrusted content, absent from intent")
            reasons.append(
                "The payment recipient was introduced by untrusted external content "
                "and does not appear in the original intent (possible redirection)."
            )
            hard_fail = True
        else:
            dims["recipient_alignment"] = 0.8 if recipient else 0.5

        # Collect evidence ids referenced by the proposal.
        evidence_ids = list(proposal.get("evidence_ids", []) or [])

        # A payment proposal that lacks a concrete amount or recipient cannot be
        # verified as intent-consistent — treat as incomplete (never auto-PASS).
        has_amount = amount_val is not None
        has_recipient = bool(recipient_id or recipient_addr)
        incomplete = not (has_amount and has_recipient)
        if incomplete and not hard_fail:
            reasons.append("Proposal is missing a concrete amount and/or recipient; cannot verify.")

        # Aggregate a coarse deterministic score.
        score = round(sum(dims.values()) / max(len(dims), 1), 3)
        return {
            "hard_fail": hard_fail,
            "incomplete": incomplete,
            "violations": violations,
            "reasons": reasons,
            "dimensions": dims,
            "evidence_ids": evidence_ids,
            "score": 0.0 if hard_fail else max(score, 0.6),
        }

    async def _semantic_alignment(self, intent: dict, proposal: dict) -> dict:
        import json

        from shared.prompts import render_prompt

        prompt = render_prompt(
            "security",
            "intent_verify_v1",
            intent=json.dumps(intent),
            proposal=json.dumps(proposal),
        )
        req = GenerationRequest(
            system_prompt=prompt,
            messages=[{"role": "user", "content": "Assess purpose/category alignment."}],
            prompt_version="intent_verify_v1",
        )
        resp = await self._provider.generate_structured(req, dict)
        data = resp.structured or {}
        return {
            "score": float(data.get("score", 0.7)),
            "mismatch": bool(data.get("mismatch", False)),
            "reason": data.get("reason"),
            "confidence": float(data.get("confidence", 0.6)),
        }
