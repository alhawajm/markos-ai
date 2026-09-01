from functools import lru_cache
from typing import Protocol, cast

from openai import AsyncOpenAI

from app.contracts.offering_document import (
    OfferingDocumentAnalysisRequest,
    OfferingDocumentAnalysisResponse,
    OfferingDocumentExtraction,
)
from app.core.config import settings
from app.core.errors import AiServiceError
from app.documents import ExtractedDocument
from app.prompts.offering_document import (
    OFFERING_DOCUMENT_PROMPT_VERSION,
    build_offering_document_input,
    build_offering_document_instructions,
)
from app.providers.openai_structured import OpenAIClient, generate_structured


class OfferingDocumentProvider(Protocol):
    async def analyze(
        self,
        request: OfferingDocumentAnalysisRequest,
        documents: list[ExtractedDocument],
    ) -> OfferingDocumentAnalysisResponse: ...


class OpenAIOfferingDocumentProvider:
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
        request: OfferingDocumentAnalysisRequest,
        documents: list[ExtractedDocument],
    ) -> OfferingDocumentAnalysisResponse:
        model = request.model or settings.llm_longform_model or settings.llm_primary_model
        if not model:
            raise AiServiceError(
                code="AI_PROVIDER_NOT_CONFIGURED",
                message="The offering document model is not configured",
                status_code=503,
                retryable=False,
            )

        generated = await generate_structured(
            client=self._client,
            input_text=build_offering_document_input(request, documents),
            instructions=build_offering_document_instructions(),
            model=model,
            output_label="offering document extraction",
            schema=OfferingDocumentExtraction,
            schema_name="markos_offering_document_extraction",
        )
        return OfferingDocumentAnalysisResponse(
            model=generated.model,
            prompt_version=f"{OFFERING_DOCUMENT_PROMPT_VERSION}.openai",
            tokens_in=generated.tokens_in,
            tokens_out=generated.tokens_out,
            extraction=generated.content,
        )


@lru_cache(maxsize=1)
def get_offering_document_provider() -> OfferingDocumentProvider:
    if settings.ai_text_provider != "openai":
        raise AiServiceError(
            code="AI_PROVIDER_NOT_CONFIGURED",
            message="Offering document analysis requires a configured AI provider",
            status_code=503,
            retryable=False,
        )
    return OpenAIOfferingDocumentProvider()
