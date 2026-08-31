import base64

from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.observability import observability_enabled
from app.main import app

SERVICE_HEADERS = {"authorization": f"Bearer {settings.internal_service_token}"}


def test_observability_disabled_without_dsn() -> None:
    assert observability_enabled() is False


def test_health() -> None:
    client = TestClient(app)
    response = client.get("/ai/health")

    assert response.status_code == 200
    assert response.json()["service"] == "ai"
    assert response.json()["status"] == "ok"


def test_ai_route_requires_internal_service_token() -> None:
    client = TestClient(app)
    response = client.post("/ai/strategy/generate", json={})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AI_SERVICE_UNAUTHORIZED"


def test_vault_embedding_contract() -> None:
    client = TestClient(app)
    response = client.post(
        "/ai/vault/embed",
        headers=SERVICE_HEADERS,
        json={"texts": ["Bahrain coffee cafe"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "text-embedding-3-small"
    assert body["dimensions"] == 1536
    assert len(body["embeddings"]) == 1
    assert len(body["embeddings"][0]) == 1536


def test_strategy_generation_contract() -> None:
    client = TestClient(app)
    response = client.post(
        "/ai/strategy/generate",
        headers=SERVICE_HEADERS,
        json={
            "workspace_id": "workspace-1",
            "objective": "increase wholesale cafe leads",
            "horizon_days": 90,
            "context": [
                {
                    "section": "COMPANY",
                    "key": "profile",
                    "value": {"name": "Pearl Coffee", "location": "Bahrain"},
                    "score": 0.82,
                }
            ],
            "model": "test-strategy-model",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "test-strategy-model"
    assert body["prompt_version"] == "strategy.v2.local"
    assert body["tokens_in"] > 0
    assert body["tokens_out"] > 0
    assert body["strategy"]["horizonDays"] == 90
    assert "COMPANY/profile" in body["strategy"]["summary"]


def test_business_profile_generation_contract() -> None:
    client = TestClient(app)
    response = client.post(
        "/ai/onboarding/profile/generate",
        headers=SERVICE_HEADERS,
        json={
            "workspace_id": "workspace-1",
            "context": [
                {
                    "section": "COMPANY",
                    "key": "profile",
                    "value": {"name": "Pearl Coffee", "location": "Bahrain"},
                    "score": 1,
                }
            ],
            "model": "test-profile-model",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "test-profile-model"
    assert body["prompt_version"] == "onboarding-business-profile.v2.local"
    assert body["profile"]["businessName"] == "Pearl Coffee"
    assert body["profile"]["overview"]["en"]
    assert body["profile"]["overview"]["ar"]


def test_offering_document_analysis_requires_configured_provider() -> None:
    client = TestClient(app)
    response = client.post(
        "/ai/onboarding/offerings/analyze",
        headers=SERVICE_HEADERS,
        json={
            "workspace_id": "workspace-1",
            "model": "test-document-model",
            "files": [
                {
                    "filename": "offers.txt",
                    "mime_type": "text/plain",
                    "base64_data": base64.b64encode(
                        "Espresso: Rich house blend\nOffice plan - Weekly delivery".encode()
                    ).decode("ascii"),
                }
            ],
        },
    )

    assert response.status_code == 503
    body = response.json()
    assert body["error"]["code"] == "AI_PROVIDER_NOT_CONFIGURED"
    assert body["error"]["details"] == [{"retryable": False}]


def test_content_generation_contract() -> None:
    client = TestClient(app)
    response = client.post(
        "/ai/content/generate",
        headers=SERVICE_HEADERS,
        json={
            "workspace_id": "workspace-1",
            "topic": "wholesale coffee leads",
            "content_type": "CAROUSEL",
            "count": 2,
            "context": [
                {
                    "section": "COMPANY",
                    "key": "profile",
                    "value": {"name": "Pearl Coffee", "location": "Bahrain"},
                    "score": 0.82,
                }
            ],
            "tone_lock": {
                "required_languages": ["ar", "en"],
                "tone_words": ["warm", "clear", "confident"],
                "voice_notes": "Helpful, bilingual, and direct.",
                "brand_hints": {"identity": {"colors": ["#123456"]}},
            },
            "model": "test-content-model",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "test-content-model"
    assert body["prompt_version"] == "content.v2.local"
    assert body["tokens_in"] > 0
    assert body["tokens_out"] > 0
    assert len(body["drafts"]) == 2
    assert body["drafts"][0]["contentType"] == "CAROUSEL"
    assert "warm, clear, confident" in body["drafts"][0]["captionEn"]
    assert body["drafts"][0]["captionAr"]
    assert body["drafts"][0]["carousel"]["slides"]


def test_image_generation_contract() -> None:
    client = TestClient(app)
    response = client.post(
        "/ai/images/generate",
        headers=SERVICE_HEADERS,
        json={
            "workspace_id": "workspace-1",
            "prompt": "Brand-aligned visual for Bahrain coffee leads",
            "aspect_ratio": "4:5",
            "model": "test-image-model",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "local-image-generator"
    assert body["prompt_version"] == "image.v2.local"
    assert body["mime_type"] == "image/jpeg"
    assert body["filename"].endswith(".jpg")
    assert body["width"] == 1024
    assert body["height"] == 1280
    assert body["tokens_in"] == 0
    assert body["tokens_out"] == 0
    assert base64.b64decode(body["base64_data"]).startswith(b"\xff\xd8")


def test_all_agent_run_contracts_are_grounded() -> None:
    client = TestClient(app)
    agents = [
        "MARKETING_STRATEGIST",
        "CONTENT_PLANNER",
        "CONTENT_CREATOR",
        "REEL_SCRIPT",
        "IMAGE_PROMPT",
        "ANALYTICS_CONSULTANT",
        "RECOMMENDATION_ENGINE",
        "BUSINESS_GROWTH_ADVISOR",
    ]

    for agent in agents:
        response = client.post(
            "/ai/agents/run",
            headers=SERVICE_HEADERS,
            json={
                "workspace_id": "workspace-1",
                "agent": agent,
                "task": "increase wholesale coffee leads",
                "locale": "en",
                "context": [
                    {
                        "section": "COMPANY",
                        "key": "profile",
                        "value": {"name": "Pearl Coffee", "location": "Bahrain"},
                        "score": 0.82,
                    }
                ],
                "model": "test-agent-model",
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["model"] == "test-agent-model"
        assert body["prompt_version"] == f"{agent.lower()}.v1.local"
        assert body["tokens_in"] > 0
        assert body["tokens_out"] > 0
        assert body["output"]["agent"] == agent
        assert "COMPANY/profile" in body["output"]["grounding"]
