from fastapi.testclient import TestClient

from app.core.observability import observability_enabled
from app.main import app


def test_observability_disabled_without_dsn() -> None:
    assert observability_enabled() is False


def test_health() -> None:
    client = TestClient(app)
    response = client.get("/ai/health")

    assert response.status_code == 200
    assert response.json()["service"] == "ai"
    assert response.json()["status"] == "ok"


def test_vault_embedding_contract() -> None:
    client = TestClient(app)
    response = client.post("/ai/vault/embed", json={"texts": ["Bahrain coffee cafe"]})

    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "text-embedding-3-small"
    assert body["dimensions"] == 1536
    assert len(body["embeddings"]) == 1
    assert len(body["embeddings"][0]) == 1536


def test_website_extraction_returns_strict_evidence_backed_candidates() -> None:
    client = TestClient(app)
    response = client.post(
        "/ai/vault/extract-website",
        json={
            "workspace_id": "workspace-1",
            "model": "test-website-model",
            "pages": [
                {
                    "url": "https://raedat.example/",
                    "title": "Raedat | Luxury Jewelry Bahrain",
                    "description": "Luxury jewelry crafted for modern women in Bahrain.",
                    "site_name": "Raedat",
                    "headline": "Timeless jewelry, crafted locally",
                    "paragraphs": [
                        "Our premium collections celebrate Bahraini craftsmanship.",
                        "Shop bridal collections and custom jewelry services.",
                    ],
                    "links": ["Shop collections", "Jewelry services"],
                    "image_alts": ["Gold ring with pearl detail"],
                    "colors": ["#78DAD1"],
                }
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "test-website-model"
    assert body["prompt_version"] == "website-extraction.v1.local"
    assert body["tokens_in"] > 0
    assert body["tokens_out"] > 0
    assert {candidate["section"] for candidate in body["candidates"]} >= {"COMPANY", "PRODUCTS", "BRAND", "TONE"}
    assert all(candidate["confidence"] >= 0.45 for candidate in body["candidates"])
    assert all(candidate["sourceSnippet"] for candidate in body["candidates"])


def test_website_extraction_attributes_child_page_evidence_to_child_url() -> None:
    client = TestClient(app)
    response = client.post(
        "/ai/vault/extract-website",
        json={
            "workspace_id": "workspace-1",
            "pages": [
                {
                    "url": "https://raedat.example/",
                    "title": "Raedat Jewelry",
                },
                {
                    "url": "https://raedat.example/collections",
                    "headline": "Bridal Collections",
                    "paragraphs": [
                        "Shop bridal collections and custom jewelry packages."
                    ],
                },
            ],
        },
    )

    assert response.status_code == 200
    candidates = response.json()["candidates"]
    story = next(candidate for candidate in candidates if candidate["section"] == "STORY")
    products = next(
        candidate for candidate in candidates if candidate["section"] == "PRODUCTS"
    )
    assert story["sourceUrl"] == "https://raedat.example/collections"
    assert products["sourceUrl"] == "https://raedat.example/collections"


def test_strategy_generation_contract() -> None:
    client = TestClient(app)
    response = client.post(
        "/ai/strategy/generate",
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
    assert body["prompt_version"] == "strategy.v1.local"
    assert body["tokens_in"] > 0
    assert body["tokens_out"] > 0
    assert body["strategy"]["horizonDays"] == 90
    assert "COMPANY/profile" in body["strategy"]["summary"]


def test_content_generation_contract() -> None:
    client = TestClient(app)
    response = client.post(
        "/ai/content/generate",
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
    assert body["prompt_version"] == "content.v1.local"
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
        json={
            "workspace_id": "workspace-1",
            "prompt": "Brand-aligned visual for Bahrain coffee leads",
            "aspect_ratio": "4:5",
            "model": "test-image-model",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "test-image-model"
    assert body["prompt_version"] == "image.v1.local"
    assert body["mime_type"] == "image/svg+xml"
    assert body["filename"].endswith(".svg")
    assert body["width"] == 1080
    assert body["height"] == 1350
    assert body["tokens_in"] > 0
    assert body["tokens_out"] > 0
    assert body["base64_data"]


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
