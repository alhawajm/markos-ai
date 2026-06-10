from datetime import UTC, datetime
import hashlib
import math
import re
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field

from app.core.config import settings


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


app = FastAPI(title="MARKOS AI Service", version="0.0.0")


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
