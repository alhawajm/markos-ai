from fastapi.testclient import TestClient

from app.main import app


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
