from functools import lru_cache
from typing import Protocol, cast

from openai import AsyncOpenAI

from app.contracts.onboarding_document import (
    OnboardingDocumentAnalysisRequest,
    OnboardingDocumentAnalysisResponse,
    OnboardingDocumentExtraction,
)
from app.core.config import settings
from app.core.errors import AiServiceError
from app.prompts.onboarding_document import (
    ONBOARDING_DOCUMENT_PROMPT_VERSION,
    build_onboarding_document_input,
    build_onboarding_document_instructions,
)
from app.providers.openai_structured import OpenAIClient, generate_structured


class OnboardingDocumentProvider(Protocol):
    async def analyze(
        self,
        request: OnboardingDocumentAnalysisRequest,
    ) -> OnboardingDocumentAnalysisResponse: ...


class OpenAIOnboardingDocumentProvider:
    def __init__(self, client: OpenAIClient | None = None) -> None:
        if client is not None:
            self._client = client
            return
        if settings.openai_api_key is None:
            raise AiServiceError(
                code="AI_PROVIDER_NOT_CONFIGURED",
                message="The AI provider is not configured",
                status_code=503,
                retryable=False,
            )
        self._client = cast(
            OpenAIClient,
            AsyncOpenAI(
                api_key=settings.openai_api_key.get_secret_value(),
                max_retries=settings.openai_max_retries,
                timeout=settings.openai_timeout_seconds,
            ),
        )

    async def analyze(
        self,
        request: OnboardingDocumentAnalysisRequest,
    ) -> OnboardingDocumentAnalysisResponse:
        model = request.model or settings.llm_longform_model or settings.llm_primary_model
        if not model:
            raise AiServiceError(
                code="AI_PROVIDER_NOT_CONFIGURED",
                message="The onboarding document model is not configured",
                status_code=503,
                retryable=False,
            )

        generated = await generate_structured(
            client=self._client,
            input_items=build_onboarding_document_input(request),
            instructions=build_onboarding_document_instructions(),
            model=model,
            output_label="onboarding document extraction",
            schema=OnboardingDocumentExtraction,
            schema_name="markos_onboarding_document_extraction",
        )
        return OnboardingDocumentAnalysisResponse(
            model=generated.model,
            prompt_version=f"{ONBOARDING_DOCUMENT_PROMPT_VERSION}.openai",
            tokens_in=generated.tokens_in,
            tokens_out=generated.tokens_out,
            extraction=generated.content,
        )


@lru_cache(maxsize=1)
def get_onboarding_document_provider() -> OnboardingDocumentProvider:
    if settings.ai_text_provider != "openai":
        raise AiServiceError(
            code="AI_PROVIDER_NOT_CONFIGURED",
            message="Full onboarding document analysis requires a configured AI provider",
            status_code=503,
            retryable=False,
        )
    return OpenAIOnboardingDocumentProvider()
