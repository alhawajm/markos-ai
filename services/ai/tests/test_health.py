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
