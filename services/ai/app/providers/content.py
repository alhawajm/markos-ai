import re
from functools import lru_cache
from typing import Protocol, cast

from openai import AsyncOpenAI

from app.contracts.content import (
    CarouselContent,
    CarouselSlide,
    ContentDraft,
    ContentDraftBatch,
    ContentGenerateRequest,
    ContentGenerateResponse,
    ReelScript,
)
from app.core.config import settings
from app.core.errors import AiServiceError
from app.prompts.content import (
    CONTENT_PROMPT_VERSION,
    build_content_input,
    build_content_instructions,
)
from app.providers.openai_structured import (
    OpenAIClient,
    generate_structured,
    invalid_output_error,
)


class ContentProvider(Protocol):
    async def generate_content(self, request: ContentGenerateRequest) -> ContentGenerateResponse: ...


class LocalContentProvider:
    async def generate_content(self, request: ContentGenerateRequest) -> ContentGenerateResponse:
        batch = build_local_content(request)
        prompt = f"{build_content_instructions(request)}\n{build_content_input(request)}"
        model = request.model or settings.llm_primary_model or "local-content-generator"

        return ContentGenerateResponse(
            model=model,
            prompt_version=f"{CONTENT_PROMPT_VERSION}.local",
            tokens_in=estimate_tokens(prompt),
            tokens_out=estimate_tokens(batch.model_dump_json(by_alias=True, exclude_none=True)),
            drafts=batch.drafts,
        )


class OpenAIContentProvider:
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

    async def generate_content(self, request: ContentGenerateRequest) -> ContentGenerateResponse:
        requested_model = (
            request.model
            if request.model is not None and not request.model.startswith("local-")
            else None
        )
        model = requested_model or settings.llm_primary_model or settings.llm_longform_model

        if not model:
            raise AiServiceError(
                code="AI_PROVIDER_NOT_CONFIGURED",
                message="The content model is not configured",
                status_code=503,
                retryable=False,
            )

        generated = await generate_structured(
            client=self._client,
            input_text=build_content_input(request),
            instructions=build_content_instructions(request),
            model=model,
            output_label="content drafts",
            schema=ContentDraftBatch,
            schema_name="markos_content_drafts",
        )
        validate_generated_batch(generated.content, request)

        return ContentGenerateResponse(
            model=generated.model,
            prompt_version=f"{CONTENT_PROMPT_VERSION}.openai",
            tokens_in=generated.tokens_in,
            tokens_out=generated.tokens_out,
            drafts=generated.content.drafts,
        )


@lru_cache(maxsize=1)
def get_content_provider() -> ContentProvider:
    if settings.ai_text_provider == "openai":
        return OpenAIContentProvider()

    return LocalContentProvider()


def validate_generated_batch(batch: ContentDraftBatch, request: ContentGenerateRequest) -> None:
    if len(batch.drafts) != request.count:
        raise invalid_output_error("content drafts")

    for draft in batch.drafts:
        if draft.content_type != request.content_type:
            raise invalid_output_error("content drafts")

        if request.content_type == "CAROUSEL" and draft.carousel is None:
            raise invalid_output_error("content drafts")

        if request.content_type != "CAROUSEL" and draft.carousel is not None:
            raise invalid_output_error("content drafts")

        if request.content_type == "REEL" and draft.reel_script is None:
            raise invalid_output_error("content drafts")

        if request.content_type != "REEL" and draft.reel_script is not None:
            raise invalid_output_error("content drafts")


def build_local_content(request: ContentGenerateRequest) -> ContentDraftBatch:
    context_summary = summarize_context(request)
    pillar = first_campaign_pillar(request.campaign)
    tone_summary = summarize_tone_lock(request)
    angles = ["educational", "proof-led", "invitation", "comparison", "behind-the-scenes"]
    drafts: list[ContentDraft] = []

    for index in range(request.count):
        angle = angles[index % len(angles)]
        article = "an" if angle[0].lower() in {"a", "e", "i", "o", "u"} else "a"
        carousel = None
        reel_script = None

        if request.content_type == "CAROUSEL":
            carousel = CarouselContent(
                slides=[
                    CarouselSlide(title="Hook", body=request.topic),
                    CarouselSlide(title="Problem", body="Show the customer pain point."),
                    CarouselSlide(title="Proof", body="Use a specific business detail from the Vault."),
                    CarouselSlide(title="Action", body="Invite the viewer to message or save."),
                ]
            )

        if request.content_type == "REEL":
            reel_script = ReelScript(
                hook=f"One thing to know about {request.topic}",
                beats=["show the product or service", "explain the benefit", "close with a direct CTA"],
                durationSeconds=20,
            )

        drafts.append(
            ContentDraft(
                contentType=request.content_type,
                captionEn=(
                    f"{request.topic}: {article} {angle} post grounded in {context_summary}. "
                    f"Use a {tone_summary} voice to connect {pillar.lower()} with a clear Instagram action."
                ),
                captionAr=(
                    f"{request.topic}: مسودة محتوى مبنية على {context_summary}. "
                    "تربط قيمة النشاط بدعوة واضحة ومناسبة للجمهور على إنستغرام."
                ),
                hashtags=["#BahrainBusiness", "#InstagramMarketing", "#MarkosAI"],
                callToAction="Send a DM to learn more.",
                contentPillar=pillar,
                carousel=carousel,
                reelScript=reel_script,
            )
        )

    return ContentDraftBatch(drafts=drafts)


def summarize_context(request: ContentGenerateRequest) -> str:
    labels: list[str] = []

    for chunk in request.context:
        label = f"{chunk.section}/{chunk.key}"
        if label not in labels:
            labels.append(label)

    return ", ".join(labels[:5]) if labels else "the available workspace context"


def first_campaign_pillar(campaign: dict[str, object] | None) -> str:
    if not campaign:
        return "Vault-grounded content"

    pillars = campaign.get("pillars")
    if not isinstance(pillars, list) or not pillars:
        return "Vault-grounded content"

    first = pillars[0]
    if not isinstance(first, dict):
        return "Vault-grounded content"

    name = first.get("name")
    return name if isinstance(name, str) and name else "Vault-grounded content"


def summarize_tone_lock(request: ContentGenerateRequest) -> str:
    if request.tone_lock.tone_words:
        return ", ".join(request.tone_lock.tone_words[:4])

    if request.tone_lock.voice_notes:
        return request.tone_lock.voice_notes[:80]

    return "clear, bilingual, brand-safe"


def estimate_tokens(text: str) -> int:
    return max(1, len(re.findall(r"\S+", text)))
