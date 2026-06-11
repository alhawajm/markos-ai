from datetime import UTC, datetime
import hashlib
import math
import re
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.observability import capture_exception, init_observability


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


class StrategyContextChunk(BaseModel):
    section: str
    key: str
    value: dict[str, object]
    score: float = 0


class StrategyGenerateRequest(BaseModel):
    workspace_id: str
    objective: str | None = None
    horizon_days: int = Field(default=90, ge=30, le=180)
    context: list[StrategyContextChunk] = Field(default_factory=list, max_length=10)
    model: str | None = None


class StrategyGenerateResponse(BaseModel):
    model: str
    prompt_version: str
    tokens_in: int
    tokens_out: int
    strategy: dict[str, object]


class ContentGenerateRequest(BaseModel):
    workspace_id: str
    topic: str = Field(min_length=3, max_length=500)
    content_type: Literal["POST", "CAROUSEL", "STORY", "REEL"] = "POST"
    count: int = Field(default=3, ge=1, le=5)
    context: list[StrategyContextChunk] = Field(default_factory=list, max_length=10)
    strategy: dict[str, object] | None = None
    model: str | None = None


class ContentGenerateResponse(BaseModel):
    model: str
    prompt_version: str
    tokens_in: int
    tokens_out: int
    drafts: list[dict[str, object]]

init_observability()
app = FastAPI(title="MARKOS AI Service", version="0.0.0")


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
        embeddings=[deterministic_embedding(text, settings.embedding_dimensions) for text in request.texts],
    )


@app.post("/ai/strategy/generate", response_model=StrategyGenerateResponse)
async def generate_strategy(request: StrategyGenerateRequest) -> StrategyGenerateResponse:
    model = request.model or settings.llm_primary_model
    prompt_text = strategy_prompt_text(request)
    strategy = build_strategy(request)
    response_text = str(strategy)

    return StrategyGenerateResponse(
        model=model,
        prompt_version="strategy.v1.local",
        tokens_in=estimate_tokens(prompt_text),
        tokens_out=estimate_tokens(response_text),
        strategy=strategy,
    )


@app.post("/ai/content/generate", response_model=ContentGenerateResponse)
async def generate_content(request: ContentGenerateRequest) -> ContentGenerateResponse:
    model = request.model or settings.llm_primary_model
    prompt_text = content_prompt_text(request)
    drafts = build_content_drafts(request)
    response_text = str(drafts)

    return ContentGenerateResponse(
        model=model,
        prompt_version="content.v1.local",
        tokens_in=estimate_tokens(prompt_text),
        tokens_out=estimate_tokens(response_text),
        drafts=drafts,
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


def build_strategy(request: StrategyGenerateRequest) -> dict[str, object]:
    context_summary = summarize_context(request.context)
    objective = request.objective or "Grow Instagram visibility and qualified customer inquiries."

    return {
        "summary": f"{request.horizon_days}-day Instagram-first strategy grounded in {context_summary}.",
        "horizonDays": request.horizon_days,
        "objectives": [
            objective,
            "Turn Knowledge Vault insights into repeatable content pillars.",
            "Build a consistent bilingual posting rhythm for Bahrain SMB audiences.",
        ],
        "pillars": [
            {
                "name": "Proof and trust",
                "rationale": "Use company story, offers, and customer pain points to make the brand feel credible.",
                "contentAngles": ["customer outcomes", "behind the scenes", "before and after", "founder point of view"],
            },
            {
                "name": "Offer education",
                "rationale": "Explain products and services in simple Arabic and English posts that reduce buying friction.",
                "contentAngles": ["product explainers", "comparison posts", "FAQs", "how to choose"],
            },
            {
                "name": "Local relevance",
                "rationale": "Anchor content in Bahrain context, language, seasonality, and local buying behavior.",
                "contentAngles": ["Bahrain moments", "community posts", "Arabic-first stories", "local partnerships"],
            },
        ],
        "weeklyCadence": [
            {"week": 1, "focus": "Message clarity", "actions": ["confirm core offer", "publish intro carousel", "test two caption tones"]},
            {"week": 2, "focus": "Audience learning", "actions": ["post FAQ reel", "collect objections", "save high-signal comments"]},
            {"week": 3, "focus": "Trust building", "actions": ["publish proof post", "share process story", "invite DM inquiries"]},
            {"week": 4, "focus": "Conversion loop", "actions": ["promote lead magnet", "review analytics", "refresh Vault learnings"]},
        ],
        "kpis": [
            {"name": "qualified Instagram inquiries", "target": "increase month over month"},
            {"name": "engagement rate", "target": "maintain upward trend"},
            {"name": "content consistency", "target": "3-5 feed posts or reels per week"},
        ],
        "risks": [
            "Publishing generic content that ignores Vault context.",
            "Skipping Arabic-ready content for a bilingual Bahrain audience.",
            "Optimizing for likes without tracking inquiries or business outcomes.",
        ],
        "nextActions": [
            "Review Vault completeness before generating content.",
            "Choose one priority objective for the next 30 days.",
            "Convert the three pillars into a first content calendar draft.",
        ],
    }


def summarize_context(context: list[StrategyContextChunk]) -> str:
    if not context:
        return "the available workspace context"

    sections = []
    for chunk in context:
        label = f"{chunk.section}/{chunk.key}"
        if label not in sections:
            sections.append(label)

    return ", ".join(sections[:5])


def strategy_prompt_text(request: StrategyGenerateRequest) -> str:
    return f"{request.workspace_id} {request.objective or ''} {request.horizon_days} {request.context}"


def estimate_tokens(text: str) -> int:
    return max(1, len(re.findall(r"\S+", text)))


def build_content_drafts(request: ContentGenerateRequest) -> list[dict[str, object]]:
    context_summary = summarize_context(request.context)
    pillar = first_strategy_pillar(request.strategy)
    drafts: list[dict[str, object]] = []

    for index in range(request.count):
        angle = ["educational", "proof-led", "invitation", "comparison", "behind-the-scenes"][index % 5]
        article = "an" if angle[0].lower() in {"a", "e", "i", "o", "u"} else "a"
        caption_en = (
            f"{request.topic}: {article} {angle} post grounded in {context_summary}. "
            f"Use this to connect {pillar.lower()} with a clear Instagram action."
        )
        caption_ar = (
            f"{request.topic}: منشور يركز على {angle} ومبني على {context_summary}. "
            "استخدمه لربط قيمة النشاط بخطوة واضحة على إنستغرام."
        )
        draft: dict[str, object] = {
            "contentType": request.content_type,
            "captionEn": caption_en,
            "captionAr": caption_ar,
            "hashtags": ["#BahrainBusiness", "#InstagramMarketing", "#MarkosAI"],
            "callToAction": "Send a DM to learn more.",
            "contentPillar": pillar,
        }

        if request.content_type == "CAROUSEL":
            draft["carousel"] = {
                "slides": [
                    {"title": "Hook", "body": request.topic},
                    {"title": "Problem", "body": "Show the customer pain point."},
                    {"title": "Proof", "body": "Use a specific business detail from the Vault."},
                    {"title": "Action", "body": "Invite the viewer to message or save."},
                ]
            }

        if request.content_type == "REEL":
            draft["reelScript"] = {
                "hook": f"One thing to know about {request.topic}",
                "beats": ["show the product or service", "explain the benefit", "close with a direct CTA"],
                "durationSeconds": 20,
            }

        drafts.append(draft)

    return drafts


def first_strategy_pillar(strategy: dict[str, object] | None) -> str:
    if not strategy:
        return "Vault-grounded content"

    pillars = strategy.get("pillars")
    if not isinstance(pillars, list) or not pillars:
        return "Vault-grounded content"

    first = pillars[0]
    if not isinstance(first, dict):
        return "Vault-grounded content"

    name = first.get("name")
    return name if isinstance(name, str) else "Vault-grounded content"


def content_prompt_text(request: ContentGenerateRequest) -> str:
    return f"{request.workspace_id} {request.topic} {request.content_type} {request.count} {request.context} {request.strategy}"
