import asyncio

import httpx
import pytest
from openai import AsyncOpenAI

from app.core.config import settings
from app.core.errors import AiServiceError
from app.providers.embeddings import VaultEmbedRequest, byte_chunks, embed_texts


def test_long_bilingual_text_preserves_every_character() -> None:
    text = "English العربية 🌸 " * 1000
    chunks = byte_chunks(text)
    assert "".join(chunks) == text
    assert all(len(chunk.encode("utf-8")) <= 6000 for chunk in chunks)


def test_openai_vectors_reordered_normalized_and_metered(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_embedding_provider", "openai")
    seen: list[httpx.Request] = []
    def respond(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"object": "list", "model": "configured-embedding-model", "data": [
            {"object": "embedding", "index": 1, "embedding": [0, 2] + [0] * 1534},
            {"object": "embedding", "index": 0, "embedding": [2, 0] + [0] * 1534},
        ], "usage": {"prompt_tokens": 19, "total_tokens": 19}})
    async def run() -> None:
        async with AsyncOpenAI(api_key="fixture", http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond))) as client:
            result = await embed_texts(VaultEmbedRequest(texts=["English", "العربية"], model="configured-embedding-model"), client)
        assert result.space == "openai:configured-embedding-model:1536:mean-v1"
        assert result.tokens_in == 19
        assert result.embeddings[0][:2] == [1, 0]
        assert result.embeddings[1][:2] == [0, 1]
    asyncio.run(run())
    assert len(seen) == 1


@pytest.mark.parametrize("fault", ["short", "duplicates", "zero"])
def test_invalid_provider_vectors_rejected(monkeypatch: pytest.MonkeyPatch, fault: str) -> None:
    monkeypatch.setattr(settings, "ai_embedding_provider", "openai")
    vector = [1.0] + [0.0] * 1535
    if fault == "short":
        vector = [1.0]
    if fault == "zero":
        vector = [0.0] * 1536
    def respond(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"object": "list", "model": "test", "data": [
            {"object": "embedding", "index": 1 if fault == "duplicates" else 0, "embedding": vector}
        ], "usage": {"prompt_tokens": 1, "total_tokens": 1}})
    async def run() -> None:
        async with AsyncOpenAI(api_key="fixture", http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond))) as client:
            with pytest.raises(AiServiceError) as error:
                await embed_texts(VaultEmbedRequest(texts=["test"]), client)
            assert error.value.code == "AI_EMBEDDING_INVALID"
    asyncio.run(run())


def test_local_vectors_do_not_impersonate_paid_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_embedding_provider", "local")
    result = asyncio.run(embed_texts(VaultEmbedRequest(texts=["Bahrain"])))
    assert result.model == "local-hash-v1"
    assert result.tokens_in == 0
    assert result.space.startswith("local:")


def test_production_configuration_never_falls_back_to_local(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_embedding_provider", None)
    monkeypatch.setattr(settings, "ai_text_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", None)
    with pytest.raises(AiServiceError) as error:
        asyncio.run(embed_texts(VaultEmbedRequest(texts=["Bahrain"])))
    assert error.value.code == "AI_PROVIDER_NOT_CONFIGURED"
