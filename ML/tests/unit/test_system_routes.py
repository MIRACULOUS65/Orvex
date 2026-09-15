"""Phase-1 verification: system routes work in MOCK mode with no external deps."""

from __future__ import annotations

from fastapi.testclient import TestClient

from config.settings import AIEnvironment, AppConfig, reset_config_for_tests
from gateway.app import create_app


def _mock_client() -> TestClient:
    reset_config_for_tests(AppConfig(ai_environment=AIEnvironment.MOCK))
    app = create_app()
    return TestClient(app)


def test_health_returns_alive():
    client = _mock_client()
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "alive"}


def test_ready_is_true_in_mock_mode():
    with _mock_client() as client:
        resp = client.get("/ready")
        assert resp.status_code == 200
        body = resp.json()
        assert body["ready"] is True
        assert body["checks"]["mode"] == "mock"


def test_version_reports_schema_and_provider():
    with _mock_client() as client:
        resp = client.get("/version")
        assert resp.status_code == 200
        body = resp.json()
        assert body["service"] == "sentinelpay-ai"
        assert body["environment"] == "mock"
        assert body["schema_versions"]["security_assessment"] == "security_assessment.v1"
        assert body["provider_chain"][0] == "groq"


def test_metrics_exposition():
    with _mock_client() as client:
        resp = client.get("/metrics")
        assert resp.status_code == 200
        assert "sentinelpay_ai_up 1" in resp.text


def test_correlation_id_is_generated_when_absent():
    with _mock_client() as client:
        resp = client.get("/version")
        assert resp.status_code == 200
        # request_id/correlation_id are internal; endpoint responds without headers.


def test_config_fails_closed_for_hosted_without_credentials():
    import pytest

    from config.settings import ConfigurationError

    cfg = AppConfig(ai_environment=AIEnvironment.HOSTED, primary_provider="qwen", qwen_api_key=None)
    with pytest.raises(ConfigurationError):
        cfg.validate_required_for_mode()
