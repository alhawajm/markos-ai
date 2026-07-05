from datetime import UTC, datetime
import base64
import hashlib
import math
import re
from typing import Literal, TypedDict

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


def default_required_languages() -> list[Literal["ar", "en"]]:
    return ["ar", "en"]


class ContentToneLock(BaseModel):
    required_languages: list[Literal["ar", "en"]] = Field(default_factory=default_required_languages, min_length=2, max_length=2)
    tone_words: list[str] = Field(default_factory=list, max_length=20)
    voice_notes: str | None = None
    brand_hints: dict[str, object] = Field(default_factory=dict)


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
    tone_lock: ContentToneLock
    strategy: dict[str, object] | None = None
    model: str | None = None


class ContentGenerateResponse(BaseModel):
    model: str
    prompt_version: str
    tokens_in: int
    tokens_out: int
    drafts: list[dict[str, object]]


class ImageGenerateRequest(BaseModel):
    workspace_id: str
    prompt: str = Field(min_length=3, max_length=1000)
    aspect_ratio: Literal["1:1", "4:5", "9:16"] = "4:5"
    model: str | None = None


class ImageGenerateResponse(BaseModel):
    model: str
    prompt_version: str
    tokens_in: int
    tokens_out: int
    prompt: str
    filename: str
    mime_type: str
    base64_data: str
    size_bytes: int
    width: int
    height: int


class BuiltImage(TypedDict):
    bytes: bytes
    filename: str
    height: int
    summary: str
    width: int


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
    context: list[StrategyContextChunk] = Field(default_factory=list, max_length=10)
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


@app.post("/ai/images/generate", response_model=ImageGenerateResponse)
async def generate_image(request: ImageGenerateRequest) -> ImageGenerateResponse:
    model = request.model or settings.image_model_primary or "local-image-generator"
    prompt_text = image_prompt_text(request)
    image = build_image_svg(request)

    return ImageGenerateResponse(
        model=model,
        prompt_version="image.v1.local",
        tokens_in=estimate_tokens(prompt_text),
        tokens_out=estimate_tokens(image["summary"]),
        prompt=request.prompt,
        filename=image["filename"],
        mime_type="image/svg+xml",
        base64_data=base64.b64encode(image["bytes"]).decode("ascii"),
        size_bytes=len(image["bytes"]),
        width=image["width"],
        height=image["height"],
    )


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
    tone_summary = summarize_tone_lock(request.tone_lock)
    drafts: list[dict[str, object]] = []

    for index in range(request.count):
        angle = ["educational", "proof-led", "invitation", "comparison", "behind-the-scenes"][index % 5]
        article = "an" if angle[0].lower() in {"a", "e", "i", "o", "u"} else "a"
        caption_en = (
            f"{request.topic}: {article} {angle} post grounded in {context_summary}. "
            f"Use a {tone_summary} voice to connect {pillar.lower()} with a clear Instagram action."
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
    return f"{request.workspace_id} {request.topic} {request.content_type} {request.count} {request.context} {request.tone_lock} {request.strategy}"


def image_prompt_text(request: ImageGenerateRequest) -> str:
    return f"{request.workspace_id} {request.aspect_ratio} {request.prompt}"


def build_image_svg(request: ImageGenerateRequest) -> BuiltImage:
    dimensions = {
        "1:1": (1080, 1080),
        "4:5": (1080, 1350),
        "9:16": (1080, 1920),
    }
    width, height = dimensions[request.aspect_ratio]
    digest = hashlib.sha256(f"{request.workspace_id}:{request.prompt}:{request.aspect_ratio}".encode("utf-8")).hexdigest()
    primary = f"#{digest[:6]}"
    secondary = f"#{digest[6:12]}"
    accent = f"#{digest[12:18]}"
    title = shorten_for_svg(request.prompt, 92)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <rect width="{width}" height="{height}" fill="{primary}"/>
  <rect x="{width * 0.08:.0f}" y="{height * 0.08:.0f}" width="{width * 0.84:.0f}" height="{height * 0.84:.0f}" rx="32" fill="{secondary}" opacity="0.84"/>
  <circle cx="{width * 0.78:.0f}" cy="{height * 0.24:.0f}" r="{width * 0.14:.0f}" fill="{accent}" opacity="0.72"/>
  <path d="M {width * 0.12:.0f} {height * 0.70:.0f} C {width * 0.30:.0f} {height * 0.56:.0f}, {width * 0.50:.0f} {height * 0.82:.0f}, {width * 0.88:.0f} {height * 0.62:.0f}" fill="none" stroke="#ffffff" stroke-width="18" opacity="0.40"/>
  <text x="{width * 0.12:.0f}" y="{height * 0.46:.0f}" fill="#ffffff" font-family="Arial, sans-serif" font-size="52" font-weight="700">
    <tspan>{escape_svg(title)}</tspan>
  </text>
  <text x="{width * 0.12:.0f}" y="{height * 0.55:.0f}" fill="#ffffff" font-family="Arial, sans-serif" font-size="30" opacity="0.82">MARKOS AI generated visual</text>
</svg>"""

    return {
        "bytes": svg.encode("utf-8"),
        "filename": f"markos-ai-{digest[:12]}.svg",
        "height": height,
        "summary": f"{request.aspect_ratio} image for {request.prompt}",
        "width": width,
    }


def shorten_for_svg(value: str, max_length: int) -> str:
    clean = " ".join(value.split())
    return clean if len(clean) <= max_length else f"{clean[: max_length - 1].rstrip()}..."


def escape_svg(value: str) -> str:
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def summarize_tone_lock(tone_lock: ContentToneLock) -> str:
    if tone_lock.tone_words:
        return ", ".join(tone_lock.tone_words[:4])

    if tone_lock.voice_notes:
        return tone_lock.voice_notes[:80]

    return "clear, bilingual, brand-safe"


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
                "objectives": ["Clarify offer", "Increase qualified Instagram inquiries", "Build bilingual trust"],
                "pillars": ["Proof and trust", "Offer education", "Local relevance"],
                "nextActions": ["Choose one 30-day objective", "Generate a content plan", "Review weekly analytics"],
            },
        }

    if request.agent == "CONTENT_PLANNER":
        return {
            **base,
            "calendar": [
                {"week": 1, "contentType": "CAROUSEL", "theme": "Proof and trust", "bestTime": "19:00 Asia/Bahrain"},
                {"week": 2, "contentType": "REEL", "theme": "Offer education", "bestTime": "20:00 Asia/Bahrain"},
                {"week": 3, "contentType": "POST", "theme": "Local relevance", "bestTime": "18:30 Asia/Bahrain"},
                {"week": 4, "contentType": "STORY", "theme": "Conversion prompt", "bestTime": "12:30 Asia/Bahrain"},
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
                "beats": ["show the product or process", "explain the practical benefit", "close with a direct CTA"],
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
                {"metric": "engagementRate", "interpretation": "Track whether educational posts outperform proof-led posts."},
                {"metric": "qualifiedInquiries", "interpretation": "Tie CTA performance back to business outcomes."},
            ],
            "recommendations": ["Compare 7-day and 28-day trends", "Promote the format with the strongest saves and DMs"],
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
        "risks": ["Generic content", "Unclear CTA", "No link between marketing activity and revenue"],
    }


def human_agent_name(agent: AgentName) -> str:
    return agent.replace("_", " ").title()


def agent_prompt_text(request: AgentRunRequest) -> str:
    return f"{request.workspace_id} {request.agent} {request.task} {request.locale} {request.context} {request.inputs}"
