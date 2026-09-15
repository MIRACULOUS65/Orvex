"""Contract fidelity tests (Requirement 10.2, 10.3, 10.4).

Round-trips canonical JSON shapes from CONTRACTS.md through our Pydantic adapters
to catch drift between this service and the shared contract spec. Uses the exact
example shapes documented in CONTRACTS.md (§6, §11, §9, §13, §20, §43, §44).
"""

from __future__ import annotations

from schemas.action_proposal import ActionProposal
from schemas.errors import Error
from schemas.evidence import Evidence
from schemas.intent import Intent
from schemas.model_metadata import ModelMetadata
from schemas.trajectory import TrajectoryEvent


def test_intent_roundtrip():
    data = {
        "schema_version": "intent.v1",
        "intent_id": "intent_001",
        "user_id": "user_001",
        "agent_id": "agent_001",
        "user_goal": "Get reliable market-data API access",
        "purpose": "market_data_access",
        "desired_outcome": "usable_market_data_service",
        "constraints": [],
        "budget": {"maximum": "10.00", "currency": "USD", "period": "daily"},
        "authorized_actions": ["PAY"],
        "forbidden_actions": ["TRANSFER_TO_UNKNOWN_WALLET"],
        "autonomy_level": "AUTOMATIC",
        "approval_conditions": [],
        "valid_from": "2026-09-11T00:00:00Z",
        "valid_until": "2026-09-12T00:00:00Z",
        "status": "VALID",
        "confidence": 0.96,
        "ambiguities": [],
        "created_at": "2026-09-11T12:00:00Z",
    }
    obj = Intent(**data)
    assert obj.schema_version == "intent.v1"
    assert obj.budget.maximum == "10.00"  # decimal string preserved
    assert isinstance(obj.model_dump()["budget"]["maximum"], str)


def test_action_proposal_roundtrip():
    data = {
        "schema_version": "action_proposal.v1",
        "proposal_id": "proposal_001",
        "intent_id": "intent_001",
        "agent_id": "agent_001",
        "action_type": "PAY",
        "purpose": "market_data_access",
        "recipient": {"type": "SERVICE", "identifier": "example-api", "address": "0x...", "network": "base-sepolia"},
        "amount": {"value": "4.20", "currency": "USDC"},
        "payment_method": "X402",
        "network": "base-sepolia",
        "reason": "Provider offers the required service within the user's budget.",
        "evidence_ids": ["evidence_001"],
        "trajectory_event_ids": ["trajectory_015"],
        "created_at": "2026-09-11T12:05:00Z",
    }
    obj = ActionProposal(**data)
    assert obj.amount.value == "4.20"
    assert "authorized" not in obj.model_dump()


def test_evidence_roundtrip():
    data = {
        "schema_version": "evidence.v1",
        "evidence_id": "evidence_001",
        "source": {"source_id": "web_123", "source_type": "WEBPAGE", "trust_level": "UNTRUSTED"},
        "content_type": "TEXT",
        "content_hash": "sha256:abc",
        "claim": "Payment address was changed",
        "raw_reference": "https://example.com",
        "timestamp": "2026-09-11T12:04:00Z",
        "derived_from": [],
        "trajectory_event_ids": ["trajectory_010"],
    }
    obj = Evidence(**data)
    assert obj.source.trust_level == "UNTRUSTED"


def test_trajectory_event_roundtrip():
    data = {
        "schema_version": "trajectory_event.v1",
        "event_id": "trajectory_001",
        "trace_id": "trace_001",
        "sequence": 17,
        "timestamp": "2026-09-11T12:04:01.120Z",
        "agent_id": "agent_001",
        "event_type": "TOOL_CALL",
        "action": {"name": "web_fetch", "tool_id": "browser_001"},
        "input_ref": "evidence_010",
        "output_ref": "evidence_011",
        "trust_context": {"source_type": "EXTERNAL", "trust_level": "UNTRUSTED"},
        "previous_event_hash": "0x00",
        "event_hash": "0x01",
    }
    obj = TrajectoryEvent(**data)
    assert obj.event_type == "TOOL_CALL"


def test_model_metadata_roundtrip():
    data = {
        "provider": "qwen",
        "model": "model-name",
        "model_version": "version",
        "configuration_version": "config-v1",
        "prompt_version": "prompt-v3",
        "temperature": 0,
        "timestamp": "2026-09-11T12:05:10Z",
    }
    obj = ModelMetadata(**data)
    assert obj.provider == "qwen"


def test_error_roundtrip():
    data = {
        "schema_version": "error.v1",
        "code": "POLICY_VIOLATION",
        "message": "Recipient is not allowlisted.",
        "severity": "HIGH",
        "retryable": False,
        "details": {"rule_id": "rule_002"},
        "correlation_id": "corr_001",
    }
    obj = Error(**data)
    assert obj.code.value == "POLICY_VIOLATION"
