"""Evaluation framework tests (Requirements 13.5, 13.7)."""

from __future__ import annotations

import pytest

from evaluation.regression.gate import RegressionGateError, enforce_gate
from evaluation.runner import BenchmarkRunner, load_cases
from security.graph import SecurityPipeline


def _pipeline_factory():
    return SecurityPipeline(provider=None)  # deterministic, offline


@pytest.mark.asyncio
async def test_golden_cases_all_pass():
    cases = load_cases("datasets")
    assert cases, "no golden cases found"
    report = await BenchmarkRunner(_pipeline_factory).run(cases)
    failing = [o.case_id for o in report.outcomes if not o.passed]
    assert report.failed == 0, f"golden failures: {failing}"


@pytest.mark.asyncio
async def test_regression_gate_passes_on_clean_report():
    cases = load_cases("datasets")
    report = await BenchmarkRunner(_pipeline_factory).run(cases)
    enforce_gate(report)  # should not raise


@pytest.mark.asyncio
async def test_regression_gate_blocks_on_p0_failure():
    from evaluation.runner import BenchmarkReport, CaseOutcome

    report = BenchmarkReport(
        dataset_version="v1", git_commit="test", timestamp="t", total=1, passed=0, failed=1,
        outcomes=[CaseOutcome(case_id="GOLDEN-003", category="PAYMENT_REDIRECTION", severity="P0", passed=False)],
    )
    with pytest.raises(RegressionGateError):
        enforce_gate(report)
