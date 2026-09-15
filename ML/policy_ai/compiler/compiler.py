"""PolicyCompiler — natural-language policy -> structured candidate + diagnostics.

Pipeline (design §B12): NL text -> LLM semantic extraction -> normalize ->
deterministic ambiguity detection -> deterministic conflict detection -> validate.
NEVER activates the policy; NEVER invents a numeric limit.
"""

from __future__ import annotations

from models.provider.router import ProviderRouter
from models.provider.base import GenerationRequest
from policy_ai.ambiguity.detector import detect_ambiguities
from policy_ai.conflict.detector import detect_conflicts
from policy_ai.normalizer.normalizer import normalize_rules
from schemas.policy_candidate import PolicyAmbiguity, PolicyCandidateResult
from shared.logging import get_logger
from shared.prompts import render_prompt

logger = get_logger("policy_ai.compiler")


class PolicyCompiler:
    def __init__(self, provider: ProviderRouter):
        self._provider = provider

    async def compile(self, policy_text: str) -> PolicyCandidateResult:
        prompt = render_prompt("policy", "v1", policy_text=policy_text)
        request = GenerationRequest(
            system_prompt=prompt,
            messages=[{"role": "user", "content": "Compile this policy."}],
            temperature=0.0,
            prompt_version="policy_v1",
        )
        resp = await self._provider.generate_structured(request, dict)
        data = resp.structured or {}

        rules = normalize_rules(data.get("rules", []))

        # Merge model-reported ambiguities with deterministic detection.
        model_ambiguities = [
            PolicyAmbiguity(clause=a.get("clause", ""), reason=a.get("reason", ""))
            for a in data.get("ambiguities", [])
            if isinstance(a, dict)
        ]
        detected = detect_ambiguities(policy_text, rules)
        ambiguities = _dedupe_ambiguities(model_ambiguities + detected)

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
            model_metadata=resp.metadata.to_dict(),
        )


def _dedupe_ambiguities(items: list[PolicyAmbiguity]) -> list[PolicyAmbiguity]:
    seen: set[tuple[str, str]] = set()
    out: list[PolicyAmbiguity] = []
    for a in items:
        key = (a.clause.strip().lower(), a.reason.strip().lower())
        if key not in seen and (a.clause or a.reason):
            seen.add(key)
            out.append(a)
    return out
