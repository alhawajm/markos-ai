import re
from functools import lru_cache
from typing import Protocol, cast

from openai import AsyncOpenAI

from app.contracts.campaign import (
    CampaignContentType,
    CampaignDay,
    CampaignGenerateRequest,
    CampaignGenerateResponse,
    CampaignKpi,
    CampaignPillar,
    CampaignPlan,
    CampaignPostSuggestion,
    CampaignWeek,
    GeneratedCampaignContent,
)
from app.core.config import settings
from app.core.errors import AiServiceError
from app.prompts.campaign import (
    CAMPAIGN_PROMPT_VERSION,
    build_campaign_input,
    build_campaign_instructions,
)
from app.providers.openai_structured import OpenAIClient, generate_structured


class CampaignProvider(Protocol):
    async def generate_campaign(
        self,
        request: CampaignGenerateRequest,
    ) -> CampaignGenerateResponse: ...


class LocalCampaignProvider:
    async def generate_campaign(
        self,
        request: CampaignGenerateRequest,
    ) -> CampaignGenerateResponse:
        campaign = build_local_campaign(request)
        prompt = f"{build_campaign_instructions(request)}\n{build_campaign_input(request)}"
        model = (
            request.model
            or settings.llm_longform_model
            or settings.llm_primary_model
            or "local-campaign-generator"
        )

        return CampaignGenerateResponse(
            model=model,
            prompt_version=f"{CAMPAIGN_PROMPT_VERSION}.local",
            tokens_in=estimate_tokens(prompt),
            tokens_out=estimate_tokens(campaign.model_dump_json(by_alias=True)),
            campaign=campaign,
        )


class OpenAICampaignProvider:
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

    async def generate_campaign(
        self,
        request: CampaignGenerateRequest,
    ) -> CampaignGenerateResponse:
        model = request.model or settings.llm_longform_model or settings.llm_primary_model

        if not model:
            raise AiServiceError(
                code="AI_PROVIDER_NOT_CONFIGURED",
                message="The campaign model is not configured",
                status_code=503,
                retryable=False,
            )

        generated = await generate_structured(
            client=self._client,
            input_text=build_campaign_input(request),
            instructions=build_campaign_instructions(request),
            model=model,
            output_label="campaign",
            schema=GeneratedCampaignContent,
            schema_name="markos_campaign",
        )

        campaign = CampaignPlan.model_validate(
            {
                **generated.content.model_dump(),
                "duration_days": request.duration_days,
                "publishes_per_day": request.publishes_per_day,
            }
        )

        return CampaignGenerateResponse(
            model=generated.model,
            prompt_version=f"{CAMPAIGN_PROMPT_VERSION}.openai",
            tokens_in=generated.tokens_in,
            tokens_out=generated.tokens_out,
            campaign=campaign,
        )


@lru_cache(maxsize=1)
def get_campaign_provider() -> CampaignProvider:
    if settings.ai_text_provider == "openai":
        return OpenAICampaignProvider()

    return LocalCampaignProvider()


def estimate_tokens(text: str) -> int:
    return max(1, len(re.findall(r"\S+", text)))


def build_local_campaign(request: CampaignGenerateRequest) -> CampaignPlan:
    context_summary = summarize_context(request)

    if request.locale == "ar":
        objective = request.objective or "زيادة الوعي المؤهل والاستفسارات عبر إنستغرام"
        return CampaignPlan(
            summary=(
                f"حملة إنستغرام لمدة {request.duration_days} يومًا مبنية على "
                f"سياق خزنة المعرفة: {context_summary}."
            ),
            durationDays=request.duration_days,
            publishesPerDay=request.publishes_per_day,
            objectives=[
                objective,
                "تحويل معرفة النشاط إلى ركائز محتوى قابلة للتكرار.",
                "بناء إيقاع نشر ثابت وملائم لجمهور البحرين.",
            ],
            pillars=[
                CampaignPillar(
                    name="الثقة والدليل",
                    rationale="استخدام قصة النشاط والعروض واحتياجات العملاء لبناء المصداقية.",
                    contentAngles=["نتائج العملاء", "خلف الكواليس", "قبل وبعد", "رأي المؤسس"],
                ),
                CampaignPillar(
                    name="تثقيف الجمهور",
                    rationale="شرح المنتجات والخدمات ببساطة لتقليل التردد قبل الشراء.",
                    contentAngles=["شرح المنتج", "مقارنات", "أسئلة شائعة", "كيفية الاختيار"],
                ),
                CampaignPillar(
                    name="الصلة المحلية",
                    rationale="ربط المحتوى بسياق البحرين والمواسم وسلوك الشراء المحلي.",
                    contentAngles=["مناسبات البحرين", "المجتمع", "قصص عربية", "شراكات محلية"],
                ),
            ],
            weeklyCadence=arabic_cadence(request.duration_days, request.publishes_per_day),
            kpis=[
                CampaignKpi(name="استفسارات إنستغرام المؤهلة", target="زيادة خلال الحملة"),
                CampaignKpi(name="معدل التفاعل", target="اتجاه تصاعدي مستمر"),
                CampaignKpi(name="استمرارية المحتوى", target=f"{request.publishes_per_day} منشور يوميًا"),
            ],
            risks=[
                "نشر محتوى عام لا يستخدم سياق خزنة المعرفة.",
                "التركيز على الإعجابات دون قياس الاستفسارات والنتائج التجارية.",
            ],
            nextActions=[
                "مراجعة اكتمال خزنة المعرفة.",
                "اختيار هدف واحد للأيام الثلاثين المقبلة.",
                "تحويل الركائز إلى مسودة تقويم محتوى.",
            ],
        )

    objective = request.objective or "Grow qualified Instagram awareness and inquiries"
    return CampaignPlan(
        summary=(
            f"{request.duration_days}-day Instagram-first campaign grounded in "
            f"Knowledge Vault context: {context_summary}."
        ),
        durationDays=request.duration_days,
        publishesPerDay=request.publishes_per_day,
        objectives=[
            objective,
            "Turn Knowledge Vault insights into repeatable content pillars.",
            "Build a consistent posting rhythm for Bahrain audiences.",
        ],
        pillars=[
            CampaignPillar(
                name="Proof and trust",
                rationale="Use the company story, offers, and customer needs to build credibility.",
                contentAngles=[
                    "customer outcomes",
                    "behind the scenes",
                    "before and after",
                    "founder point of view",
                ],
            ),
            CampaignPillar(
                name="Offer education",
                rationale="Explain products and services simply to reduce buying friction.",
                contentAngles=["product explainers", "comparisons", "FAQs", "how to choose"],
            ),
            CampaignPillar(
                name="Local relevance",
                rationale="Anchor content in Bahrain context, seasonality, and buying behavior.",
                contentAngles=[
                    "Bahrain moments",
                    "community posts",
                    "Arabic-first stories",
                    "local partnerships",
                ],
            ),
        ],
        weeklyCadence=english_cadence(request.duration_days, request.publishes_per_day),
        kpis=[
            CampaignKpi(name="qualified Instagram inquiries", target="increase during the campaign"),
            CampaignKpi(name="engagement rate", target="maintain an upward trend"),
            CampaignKpi(name="content consistency", target=f"{request.publishes_per_day} publishes per day"),
        ],
        risks=[
            "Publishing generic content that ignores Vault context.",
            "Optimizing for likes without tracking inquiries or business outcomes.",
        ],
        nextActions=[
            "Review Vault completeness before generating content.",
            "Choose one priority objective for the next 30 days.",
            "Convert the pillars into a first content calendar draft.",
        ],
    )


def summarize_context(request: CampaignGenerateRequest) -> str:
    labels: list[str] = []

    for chunk in request.context:
        label = f"{chunk.section}/{chunk.key}"
        if label not in labels:
            labels.append(label)

    return ", ".join(labels[:5]) if labels else "available workspace context"


def english_cadence(duration_days: int, publishes_per_day: int) -> list[CampaignWeek]:
    week_focuses = ["Clarify the offer", "Build trust and invite action"]
    formats: list[CampaignContentType] = ["REEL", "CAROUSEL", "STORY", "POST"]
    pillars = ["Proof and trust", "Offer education", "Local relevance"]
    templates = [
        ("Introduce the offer clearly", "Explain the core offer and who it helps.", "Build qualified awareness"),
        ("Answer one buying question", "Resolve a practical question that may delay a decision.", "Reduce buying friction"),
        ("Show how the work happens", "Share a credible detail from the process or customer experience.", "Build trust"),
        ("Connect the offer to Bahrain", "Ground the message in a relevant local need or moment.", "Increase local relevance"),
        ("Invite a useful response", "Ask a focused question that helps MARKOS learn about the audience.", "Learn from the audience"),
    ]
    return build_cadence(
        duration_days=duration_days,
        publishes_per_day=publishes_per_day,
        week_focuses=week_focuses,
        formats=formats,
        pillars=pillars,
        templates=templates,
    )


def arabic_cadence(duration_days: int, publishes_per_day: int) -> list[CampaignWeek]:
    week_focuses = ["توضيح العرض", "بناء الثقة والدعوة للتفاعل"]
    formats: list[CampaignContentType] = ["REEL", "CAROUSEL", "STORY", "POST"]
    pillars = ["الثقة والدليل", "تثقيف الجمهور", "الصلة المحلية"]
    templates = [
        ("عرّف بالعرض بوضوح", "اشرح العرض الأساسي ومن يستفيد منه.", "زيادة الوعي المؤهل"),
        ("أجب عن سؤال قبل الشراء", "عالج سؤالاً عملياً قد يؤخر قرار العميل.", "تقليل التردد قبل الشراء"),
        ("اعرض طريقة العمل", "شارك تفصيلاً موثوقاً من العملية أو تجربة العميل.", "بناء الثقة"),
        ("اربط العرض بالبحرين", "اربط الرسالة بحاجة أو مناسبة محلية ذات صلة.", "تعزيز الصلة المحلية"),
        ("ادعُ إلى تفاعل مفيد", "اطرح سؤالاً محدداً يساعد MARKOS على فهم الجمهور.", "التعلم من الجمهور"),
    ]
    return build_cadence(
        duration_days=duration_days,
        publishes_per_day=publishes_per_day,
        week_focuses=week_focuses,
        formats=formats,
        pillars=pillars,
        templates=templates,
    )


def build_cadence(
    *,
    duration_days: int,
    publishes_per_day: int,
    week_focuses: list[str],
    formats: list[CampaignContentType],
    pillars: list[str],
    templates: list[tuple[str, str, str]],
) -> list[CampaignWeek]:
    weeks: list[CampaignWeek] = []

    for week_index, first_day in enumerate(range(1, duration_days + 1, 7)):
        days: list[CampaignDay] = []
        for day_number in range(first_day, min(first_day + 7, duration_days + 1)):
            posts: list[CampaignPostSuggestion] = []
            for post_index in range(publishes_per_day):
                sequence = (day_number - 1) * publishes_per_day + post_index
                title, description, goal = templates[sequence % len(templates)]
                posts.append(
                    CampaignPostSuggestion(
                        contentType=formats[sequence % len(formats)],
                        title=title,
                        description=description,
                        goal=goal,
                        contentPillar=pillars[sequence % len(pillars)],
                    )
                )
            days.append(CampaignDay(day=day_number, posts=posts))
        weeks.append(CampaignWeek(week=week_index + 1, focus=week_focuses[week_index % len(week_focuses)], days=days))

    return weeks
