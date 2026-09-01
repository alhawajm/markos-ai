import asyncio
import hashlib
import math
import re
import secrets
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.responses import Response

from app.contracts.business_profile import (
    BusinessProfileGenerateRequest,
    BusinessProfileGenerateResponse,
)
from app.contracts.campaign import (
    CampaignGenerateRequest,
    CampaignGenerateResponse,
    VaultContextChunk,
)
from app.contracts.content import ContentGenerateRequest, ContentGenerateResponse
from app.contracts.image import ImageGenerateRequest, ImageGenerateResponse
from app.contracts.offering_document import (
    OfferingDocumentAnalysisRequest,
    OfferingDocumentAnalysisResponse,
)
from app.contracts.onboarding_document import (
    OnboardingDocumentAnalysisRequest,
    OnboardingDocumentAnalysisResponse,
)
from app.core.config import settings
from app.core.errors import AiServiceError
from app.core.observability import capture_exception, init_observability
from app.documents import extract_documents
from app.providers.business_profile import get_business_profile_provider
from app.providers.campaign import get_campaign_provider
from app.providers.content import get_content_provider
from app.providers.image import get_image_provider
from app.providers.offering_document import get_offering_document_provider
from app.providers.onboarding_document import get_onboarding_document_provider


class HealthResponse(BaseModel):
    service: Literal["ai"]
    status: Literal["ok", "degraded"]
    timestamp: str


class VaultEmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=50)
    model: str | None = None


class VaultEmbedResponse(BaseModel):
    model: str
    dimensions: int
    embeddings: list[list[float]]


AgentName = Literal[
    "MARKETING_STRATEGIST",
    "CONTENT_PLANNER",
    "CONTENT_CREATOR",
    "REEL_SCRIPT",
    "IMAGE_PROMPT",
    "ANALYTICS_CONSULTANT",
    "RECOMMENDATION_ENGINE",
    "BUSINESS_GROWTH_ADVISOR",
]


class AgentRunRequest(BaseModel):
    workspace_id: str
    agent: AgentName
    task: str = Field(min_length=3, max_length=1000)
    locale: Literal["ar", "en"] = "en"
    context: list[VaultContextChunk] = Field(default_factory=list, max_length=10)
    inputs: dict[str, object] | None = None
    model: str | None = None


class AgentRunResponse(BaseModel):
    model: str
    prompt_version: str
    tokens_in: int
    tokens_out: int
    output: dict[str, object]


init_observability()
app = FastAPI(title="MARKOS AI Service", version="0.0.0")


@app.middleware("http")
async def authenticate_internal_request(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    if request.url.path in {"/ai/health", "/ai/health/deep"}:
        return await call_next(request)

    if request.url.path.startswith("/ai/"):
        supplied = request.headers.get("authorization", "")
        expected = f"Bearer {settings.internal_service_token}"

        if not secrets.compare_digest(supplied, expected):
            return JSONResponse(
                status_code=401,
                content={
                    "error": {
                        "code": "AI_SERVICE_UNAUTHORIZED",
                        "message": "A valid internal service token is required",
                        "details": [{"retryable": False}],
                    }
                },
            )

    return await call_next(request)


@app.exception_handler(AiServiceError)
async def ai_service_error_handler(_request: Request, error: AiServiceError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content={
            "error": {
                "code": error.code,
                "message": error.message,
                "details": [{"retryable": error.retryable}],
            }
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, error: Exception) -> JSONResponse:
    capture_exception(error)

    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "Unexpected server error",
            }
        },
    )


@app.get("/ai/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        service="ai",
        status="ok",
        timestamp=datetime.now(UTC).isoformat(),
    )


@app.get("/ai/health/deep")
async def deep_health() -> dict[str, object]:
    return {
        "service": "ai",
        "status": "degraded",
        "timestamp": datetime.now(UTC).isoformat(),
        "dependencies": {
            "database": "not_checked",
            "providers": "not_checked",
            "embeddings": "not_checked",
        },
    }


@app.post("/ai/vault/embed", response_model=VaultEmbedResponse)
async def embed_vault(request: VaultEmbedRequest) -> VaultEmbedResponse:
    model = request.model or settings.embedding_model

    return VaultEmbedResponse(
        model=model,
        dimensions=settings.embedding_dimensions,
        embeddings=[
            deterministic_embedding(text, settings.embedding_dimensions) for text in request.texts
        ],
    )


@app.post("/ai/campaigns/generate", response_model=CampaignGenerateResponse)
async def generate_campaign(request: CampaignGenerateRequest) -> CampaignGenerateResponse:
    if not request.context:
        raise AiServiceError(
            code="AI_CONTEXT_MISSING",
            message="Business Profile context is required for campaign generation",
            status_code=422,
            retryable=False,
        )

    provider = get_campaign_provider()

    try:
        async with asyncio.timeout(settings.ai_campaign_timeout_seconds):
            return await provider.generate_campaign(request)
    except TimeoutError:
        raise AiServiceError(
            code="AI_PROVIDER_TIMEOUT",
            message="The AI provider timed out",
            status_code=504,
            retryable=True,
        ) from None


@app.post("/ai/onboarding/profile/generate", response_model=BusinessProfileGenerateResponse)
async def generate_business_profile(
    request: BusinessProfileGenerateRequest,
) -> BusinessProfileGenerateResponse:
    provider = get_business_profile_provider()

    try:
        async with asyncio.timeout(settings.ai_profile_timeout_seconds):
            return await provider.generate_profile(request)
    except TimeoutError:
        raise AiServiceError(
            code="AI_PROVIDER_TIMEOUT",
            message="The AI provider timed out",
            status_code=504,
            retryable=True,
        ) from None


@app.post(
    "/ai/onboarding/offerings/analyze",
    response_model=OfferingDocumentAnalysisResponse,
    response_model_exclude_none=True,
)
async def analyze_offering_documents(
    request: OfferingDocumentAnalysisRequest,
) -> OfferingDocumentAnalysisResponse:
    documents = extract_documents(request.files)
    provider = get_offering_document_provider()

    try:
        async with asyncio.timeout(settings.ai_document_timeout_seconds):
            return await provider.analyze(request, documents)
    except TimeoutError:
        raise AiServiceError(
            code="AI_PROVIDER_TIMEOUT",
            message="The AI provider timed out",
            status_code=504,
            retryable=True,
        ) from None


@app.post(
    "/ai/onboarding/documents/analyze",
    response_model=OnboardingDocumentAnalysisResponse,
    response_model_exclude_none=True,
)
async def analyze_onboarding_documents(
    request: OnboardingDocumentAnalysisRequest,
) -> OnboardingDocumentAnalysisResponse:
    provider = get_onboarding_document_provider()

    try:
        async with asyncio.timeout(settings.ai_document_timeout_seconds):
            return await provider.analyze(request)
    except TimeoutError:
        raise AiServiceError(
            code="AI_PROVIDER_TIMEOUT",
            message="The AI provider timed out",
            status_code=504,
            retryable=True,
        ) from None


@app.post(
    "/ai/content/generate", response_model=ContentGenerateResponse, response_model_exclude_none=True
)
async def generate_content(request: ContentGenerateRequest) -> ContentGenerateResponse:
    if not request.context:
        raise AiServiceError(
            code="AI_CONTEXT_MISSING",
            message="Knowledge Vault context is required for content generation",
            status_code=422,
            retryable=False,
        )

    provider = get_content_provider()

    try:
        async with asyncio.timeout(settings.ai_content_timeout_seconds):
            return await provider.generate_content(request)
    except TimeoutError:
        raise AiServiceError(
            code="AI_PROVIDER_TIMEOUT",
            message="The AI provider timed out",
            status_code=504,
            retryable=True,
        ) from None


@app.post("/ai/images/generate", response_model=ImageGenerateResponse)
async def generate_image(request: ImageGenerateRequest) -> ImageGenerateResponse:
    provider = get_image_provider()

    try:
        async with asyncio.timeout(settings.ai_image_timeout_seconds):
            return await provider.generate_image(request)
    except TimeoutError:
        raise AiServiceError(
            code="AI_PROVIDER_TIMEOUT",
            message="The AI image provider timed out",
            status_code=504,
            retryable=True,
        ) from None


@app.post("/ai/agents/run", response_model=AgentRunResponse)
async def run_agent(request: AgentRunRequest) -> AgentRunResponse:
    model = request.model or settings.llm_primary_model
    prompt_text = agent_prompt_text(request)
    output = build_agent_output(request)
    response_text = str(output)

    return AgentRunResponse(
        model=model,
        prompt_version=f"{request.agent.lower()}.v1.local",
        tokens_in=estimate_tokens(prompt_text),
        tokens_out=estimate_tokens(response_text),
        output=output,
    )


def deterministic_embedding(text: str, dimensions: int) -> list[float]:
    vector = [0.0 for _ in range(dimensions)]

    for token in re.findall(r"\w+", text.casefold()):
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimensions
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign

    norm = math.sqrt(sum(value * value for value in vector))

    if norm == 0:
        return vector

    return [value / norm for value in vector]


def summarize_context(context: list[VaultContextChunk]) -> str:
    if not context:
        return "the available workspace context"

    sections = []
    for chunk in context:
        label = f"{chunk.section}/{chunk.key}"
        if label not in sections:
            sections.append(label)

    return ", ".join(sections[:5])


def estimate_tokens(text: str) -> int:
    return max(1, len(re.findall(r"\S+", text)))


def build_agent_output(request: AgentRunRequest) -> dict[str, object]:
    context_summary = summarize_context(request.context)
    base = {
        "agent": request.agent,
        "task": request.task,
        "locale": request.locale,
        "grounding": context_summary,
        "summary": f"{human_agent_name(request.agent)} response grounded in {context_summary}.",
    }

    if request.agent == "MARKETING_STRATEGIST":
        return {
            **base,
            "strategy": {
                "objectives": [
                    "Clarify offer",
                    "Increase qualified Instagram inquiries",
                    "Build bilingual trust",
                ],
                "pillars": ["Proof and trust", "Offer education", "Local relevance"],
                "nextActions": [
                    "Choose one 30-day objective",
                    "Generate a content plan",
                    "Review weekly analytics",
                ],
            },
        }

    if request.agent == "CONTENT_PLANNER":
        return {
            **base,
            "calendar": [
                {
                    "week": 1,
                    "contentType": "CAROUSEL",
                    "theme": "Proof and trust",
                    "bestTime": "19:00 Asia/Bahrain",
                },
                {
                    "week": 2,
                    "contentType": "REEL",
                    "theme": "Offer education",
                    "bestTime": "20:00 Asia/Bahrain",
                },
                {
                    "week": 3,
                    "contentType": "POST",
                    "theme": "Local relevance",
                    "bestTime": "18:30 Asia/Bahrain",
                },
                {
                    "week": 4,
                    "contentType": "STORY",
                    "theme": "Conversion prompt",
                    "bestTime": "12:30 Asia/Bahrain",
                },
            ],
            "distribution": {"POST": 35, "CAROUSEL": 30, "REEL": 25, "STORY": 10},
        }

    if request.agent == "CONTENT_CREATOR":
        return {
            **base,
            "draft": {
                "captionEn": f"{request.task}: a Vault-grounded Instagram caption with a clear CTA.",
                "captionAr": f"{request.task}: صياغة إنستغرام مبنية على معرفة النشاط مع دعوة واضحة.",
                "hashtags": ["#BahrainBusiness", "#InstagramMarketing", "#MarkosAI"],
                "callToAction": "Send a DM to learn more.",
            },
        }

    if request.agent == "REEL_SCRIPT":
        return {
            **base,
            "script": {
                "hook": f"One thing your audience should know about {request.task}",
                "beats": [
                    "show the product or process",
                    "explain the practical benefit",
                    "close with a direct CTA",
                ],
                "cta": "Message us today.",
                "durationSeconds": 20,
            },
        }

    if request.agent == "IMAGE_PROMPT":
        return {
            **base,
            "imagePrompt": {
                "prompt": f"Brand-aligned Instagram visual for {request.task}, using Vault context: {context_summary}.",
                "negativePrompt": "generic stock photo, unreadable text, distorted logo, off-brand colors",
                "aspectRatio": "4:5",
            },
        }

    if request.agent == "ANALYTICS_CONSULTANT":
        return {
            **base,
            "insights": [
                {
                    "metric": "engagementRate",
                    "interpretation": "Track whether educational posts outperform proof-led posts.",
                },
                {
                    "metric": "qualifiedInquiries",
                    "interpretation": "Tie CTA performance back to business outcomes.",
                },
            ],
            "recommendations": [
                "Compare 7-day and 28-day trends",
                "Promote the format with the strongest saves and DMs",
            ],
        }

    if request.agent == "RECOMMENDATION_ENGINE":
        return {
            **base,
            "recommendations": [
                {"type": "content", "action": "Turn the strongest FAQ into a carousel"},
                {"type": "timing", "action": "Test evening posts for Bahrain audience activity"},
                {"type": "campaign", "action": "Create a two-week offer education sequence"},
            ],
        }

    return {
        **base,
        "advice": [
            "Prioritize one measurable growth objective for the next 30 days.",
            "Use customer objections from the Vault as content inputs.",
            "Review weekly performance before expanding campaigns.",
        ],
        "risks": [
            "Generic content",
            "Unclear CTA",
            "No link between marketing activity and revenue",
        ],
    }


def human_agent_name(agent: AgentName) -> str:
    return agent.replace("_", " ").title()


def agent_prompt_text(request: AgentRunRequest) -> str:
    return f"{request.workspace_id} {request.agent} {request.task} {request.locale} {request.context} {request.inputs}"
