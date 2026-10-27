from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.config import settings
from app.main import app


def test_readiness_requires_service_authentication() -> None:
    response = TestClient(app).get("/ai/ready")
    assert response.status_code == 401


def test_readiness_checks_configuration_without_paid_provider_calls() -> None:
    with patch("app.readiness.shutil.which", return_value="/usr/bin/ffmpeg"), patch.object(
        settings, "ai_text_provider", "openai"
    ), patch.object(settings, "openai_api_key", SecretStr("private-fixture-key")):
        response = TestClient(app).get(
            "/ai/ready", headers={"authorization": f"Bearer {settings.internal_service_token}"}
        )
    assert response.status_code == 200
    assert response.json()["providerConnectivity"] == "not_checked"
    assert "private-fixture-key" not in response.text


def test_readiness_reports_missing_key_or_renderer_as_unavailable() -> None:
    with patch("app.readiness.shutil.which", return_value=None), patch.object(
        settings, "ai_text_provider", "openai"
    ), patch.object(settings, "openai_api_key", None):
        response = TestClient(app).get(
            "/ai/ready", headers={"authorization": f"Bearer {settings.internal_service_token}"}
        )
    assert response.status_code == 503
    assert response.json()["dependencies"]["textConfiguration"] == "missing_key"
    assert response.json()["dependencies"]["motionRenderer"] == "missing_ffmpeg"
