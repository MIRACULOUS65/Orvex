"""Evaluation framework core (Requirements 13.5, 13.6).

Runs a set of EvalCases through the deterministic security pipeline and reports
per-category pass/fail plus precision/recall style counts. Tagged with git commit
+ dataset version for reproducibility.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

_DATA_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class EvalCase:
    case_id: str
    category: str
    severity: str  # P0..P4
    inputs: dict
    expected: dict


@dataclass
class CaseOutcome:
    case_id: str
    category: str
    severity: str
    passed: bool
    detail: str = ""


@dataclass
class BenchmarkReport:
    dataset_version: str
    git_commit: str
    timestamp: str
    total: int
    passed: int
    failed: int
    outcomes: list[CaseOutcome] = field(default_factory=list)

    @property
    def p0_failures(self) -> list[CaseOutcome]:
        return [o for o in self.outcomes if not o.passed and o.severity == "P0"]

    def to_dict(self) -> dict:
        return {
            "dataset_version": self.dataset_version,
            "git_commit": self.git_commit,
            "timestamp": self.timestamp,
            "total": self.total,
            "passed": self.passed,
            "failed": self.failed,
            "p0_failures": [o.case_id for o in self.p0_failures],
            "outcomes": [
                {"case_id": o.case_id, "category": o.category, "severity": o.severity, "passed": o.passed, "detail": o.detail}
                for o in self.outcomes
            ],
        }


def _git_commit() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        return "unknown"


def load_cases(subdir: str) -> list[EvalCase]:
    cases: list[EvalCase] = []
    directory = _DATA_DIR / subdir
    if not directory.exists():
        return cases
    for path in sorted(directory.glob("*.json")):
        data = json.loads(path.read_text())
        cases.append(
            EvalCase(
                case_id=data["case_id"],
                category=data["category"],
                severity=data.get("severity", "P2"),
                inputs=data["inputs"],
                expected=data["expected"],
            )
        )
    return cases


class BenchmarkRunner:
    def __init__(self, pipeline_factory):
        # pipeline_factory() -> SecurityPipeline (async .analyze)
        self._factory = pipeline_factory

    async def run(self, cases: list[EvalCase], *, dataset_version: str = "v1") -> BenchmarkReport:
        outcomes: list[CaseOutcome] = []
        for case in cases:
            outcome = await self._run_case(case)
            outcomes.append(outcome)
        passed = sum(1 for o in outcomes if o.passed)
        return BenchmarkReport(
            dataset_version=dataset_version,
            git_commit=_git_commit(),
            timestamp=datetime.now(timezone.utc).isoformat(),
            total=len(outcomes),
            passed=passed,
            failed=len(outcomes) - passed,
            outcomes=outcomes,
        )

    async def _run_case(self, case: EvalCase) -> CaseOutcome:
        pipeline = self._factory()
        inp = case.inputs
        assessment = await pipeline.analyze(
            intent=inp.get("intent", {}),
            proposal=inp.get("proposal", {}),
            trajectory=inp.get("trajectory", []),
            evidence=inp.get("evidence", []),
            recipient_context=inp.get("recipient_context"),
            historical_behavior=inp.get("historical_behavior"),
        )
        exp = case.expected
        checks: list[tuple[str, bool]] = []
        if "intent_status" in exp:
            checks.append(("intent_status", assessment.intent_verification.status == exp["intent_status"]))
        if "threat_detected" in exp:
            checks.append(("threat_detected", assessment.threat_assessment.detected == exp["threat_detected"]))
        if "threat_category" in exp:
            checks.append(("threat_category", exp["threat_category"] in assessment.threat_assessment.categories))
        if "risk_level_in" in exp:
            checks.append(("risk_level_in", assessment.risk_assessment.level in exp["risk_level_in"]))
        if "recommended_handling" in exp:
            checks.append(("recommended_handling", assessment.overall_assessment.recommended_handling == exp["recommended_handling"]))

        failed = [name for name, ok in checks if not ok]
        return CaseOutcome(
            case_id=case.case_id,
            category=case.category,
            severity=case.severity,
            passed=not failed,
            detail=("failed: " + ", ".join(failed)) if failed else "ok",
        )
