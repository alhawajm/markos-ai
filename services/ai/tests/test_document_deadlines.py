import asyncio
import base64
from types import ModuleType

import httpx
import pytest
from fastapi.testclient import TestClient
from openai import AsyncOpenAI
from pydantic import SecretStr

from app import main
from app.contracts.offering_document import OfferingDocumentAnalysisRequest
from app.contracts.onboarding_document import OnboardingDocumentAnalysisRequest
from app.core.config import settings
from app.core.errors import AiServiceError
from app.providers import offering_document, onboarding_document


def document_payload() -> dict[str, object]:
    return {
        "workspace_id": "test-workspace",
        "model": "test-document-model",
        "files": [{
            "filename": "business.txt",
            "mime_type": "text/plain",
            "base64_data": base64.b64encode(b"Business details").decode("ascii"),
        }],
    }


@pytest.mark.parametrize("module", [onboarding_document, offering_document])
def test_document_attempt_uses_document_budget_without_sdk_retry(
    monkeypatch: pytest.MonkeyPatch, module: ModuleType,
) -> None:
    requests: list[httpx.Request] = []
    clients: list[AsyncOpenAI] = []

    def timed_out(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        raise httpx.ReadTimeout("Document response timed out", request=request)

    def build_client(*, api_key: str, max_retries: int, timeout: float) -> AsyncOpenAI:
        client = AsyncOpenAI(
            api_key=api_key, max_retries=max_retries, timeout=timeout,
            http_client=httpx.AsyncClient(transport=httpx.MockTransport(timed_out)),
        )
        clients.append(client)
        return client

    monkeypatch.setattr(settings, "openai_api_key", SecretStr("test-only-placeholder"))
    monkeypatch.setattr(settings, "openai_timeout_seconds", 45)
    monkeypatch.setattr(settings, "openai_max_retries", 3)
    monkeypatch.setattr(settings, "ai_document_timeout_seconds", 120)
    monkeypatch.setattr(module, "AsyncOpenAI", build_client)

    async def run() -> None:
        try:
            with pytest.raises(AiServiceError) as raised:
                if module is onboarding_document:
                    await onboarding_document.OpenAIOnboardingDocumentProvider().analyze(
                        OnboardingDocumentAnalysisRequest.model_validate(document_payload())
                    )
                else:
                    await offering_document.OpenAIOfferingDocumentProvider().analyze(
                        OfferingDocumentAnalysisRequest.model_validate(document_payload()), []
                    )
            assert raised.value.code == "AI_PROVIDER_TIMEOUT"
            assert raised.value.retryable is True
            assert len(requests) == 1
            assert requests[0].extensions["timeout"]["read"] == 120
        finally:
            for client in clients:
                await client.close()

    asyncio.run(run())


@pytest.mark.parametrize("kind", ["documents", "offerings"])
def test_document_endpoint_cancels_at_deadline_and_returns_retryable_failure(
    monkeypatch: pytest.MonkeyPatch, kind: str,
) -> None:
    cancelled = False

    class SlowProvider:
        async def analyze(self, *args: object) -> None:
            nonlocal cancelled
            try:
                await asyncio.Event().wait()
            finally:
                cancelled = True

    getter = (
        "get_onboarding_document_provider" if kind == "documents"
        else "get_offering_document_provider"
    )
    monkeypatch.setattr(main, getter, SlowProvider)
    monkeypatch.setattr(settings, "ai_document_timeout_seconds", 0.01)
    with TestClient(main.app) as client:
        response = client.post(
            f"/ai/onboarding/{kind}/analyze",
            headers={"authorization": f"Bearer {settings.internal_service_token}"},
            json=document_payload(),
        )
    assert response.status_code == 504
    assert response.json()["error"]["code"] == "AI_PROVIDER_TIMEOUT"
    assert response.json()["error"]["details"] == [{"retryable": True}]
    assert cancelled is True
