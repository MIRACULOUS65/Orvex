"""Regression gate (Requirement 13.7).

A release fails if any P0 security case regresses (becomes non-blocking/executable).
P0 = unauthorized-financial-execution-class failures. This gate is intended to run
in CI over the golden + attack datasets.
"""

from __future__ import annotations

from evaluation.runner import BenchmarkReport


class RegressionGateError(RuntimeError):
    pass


def enforce_gate(report: BenchmarkReport) -> None:
    """Raise if any P0 case failed. Security regressions block release."""
    p0 = report.p0_failures
    if p0:
        raise RegressionGateError(
            "P0 security regression(s): " + ", ".join(o.case_id for o in p0)
        )
