import re
from functools import lru_cache
from typing import Protocol, cast

from openai import AsyncOpenAI

from app.contracts.strategy import (
    GeneratedStrategyContent,
    StrategyGenerateRequest,
    StrategyGenerateResponse,
    StrategyKpi,
    StrategyPillar,
    StrategyPlan,
    StrategyWeek,
)
from app.core.config import settings
from app.core.errors import AiServiceError
from app.prompts.strategy import (
    STRATEGY_PROMPT_VERSION,
    build_strategy_input,
    build_strategy_instructions,
)
from app.providers.openai_structured import OpenAIClient, generate_structured


class StrategyProvider(Protocol):
    async def generate_strategy(
        self,
        request: StrategyGenerateRequest,
    ) -> StrategyGenerateResponse: ...


class LocalStrategyProvider:
    async def generate_strategy(
        self,
        request: StrategyGenerateRequest,
    ) -> StrategyGenerateResponse:
        strategy = build_local_strategy(request)
        prompt = f"{build_strategy_instructions(request)}\n{build_strategy_input(request)}"
        model = (
            request.model
            or settings.llm_longform_model
            or settings.llm_primary_model
            or "local-strategy-generator"
        )

        return StrategyGenerateResponse(
            model=model,
            prompt_version=f"{STRATEGY_PROMPT_VERSION}.local",
            tokens_in=estimate_tokens(prompt),
            tokens_out=estimate_tokens(strategy.model_dump_json(by_alias=True)),
            strategy=strategy,
        )


class OpenAIStrategyProvider:
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

    async def generate_strategy(
        self,
        request: StrategyGenerateRequest,
    ) -> StrategyGenerateResponse:
        model = request.model or settings.llm_longform_model or settings.llm_primary_model

        if not model:
            raise AiServiceError(
                code="AI_PROVIDER_NOT_CONFIGURED",
                message="The strategy model is not configured",
                status_code=503,
                retryable=False,
            )

        generated = await generate_structured(
            client=self._client,
            input_text=build_strategy_input(request),
            instructions=build_strategy_instructions(request),
            model=model,
            output_label="strategy",
            schema=GeneratedStrategyContent,
            schema_name="markos_strategy",
        )

        strategy = StrategyPlan.model_validate(
            {
                **generated.content.model_dump(),
                "horizon_days": request.horizon_days,
            }
        )

        return StrategyGenerateResponse(
            model=generated.model,
            prompt_version=f"{STRATEGY_PROMPT_VERSION}.openai",
            tokens_in=generated.tokens_in,
            tokens_out=generated.tokens_out,
            strategy=strategy,
        )


@lru_cache(maxsize=1)
def get_strategy_provider() -> StrategyProvider:
    if settings.ai_text_provider == "openai":
        return OpenAIStrategyProvider()

    return LocalStrategyProvider()


def estimate_tokens(text: str) -> int:
    return max(1, len(re.findall(r"\S+", text)))


def build_local_strategy(request: StrategyGenerateRequest) -> StrategyPlan:
    context_summary = summarize_context(request)

    if request.locale == "ar":
        objective = request.objective or "زيادة الوعي المؤهل والاستفسارات عبر إنستغرام"
        return StrategyPlan(
            summary=(
                f"استراتيجية إنستغرام لمدة {request.horizon_days} يومًا مبنية على "
                f"سياق خزنة المعرفة: {context_summary}."
            ),
            horizonDays=request.horizon_days,
            objectives=[
                objective,
                "تحويل معرفة النشاط إلى ركائز محتوى قابلة للتكرار.",
                "بناء إيقاع نشر ثابت وملائم لجمهور البحرين.",
            ],
            pillars=[
                StrategyPillar(
                    name="الثقة والدليل",
                    rationale="استخدام قصة النشاط والعروض واحتياجات العملاء لبناء المصداقية.",
                    contentAngles=["نتائج العملاء", "خلف الكواليس", "قبل وبعد", "رأي المؤسس"],
                ),
                StrategyPillar(
                    name="تثقيف الجمهور",
                    rationale="شرح المنتجات والخدمات ببساطة لتقليل التردد قبل الشراء.",
                    contentAngles=["شرح المنتج", "مقارنات", "أسئلة شائعة", "كيفية الاختيار"],
                ),
                StrategyPillar(
                    name="الصلة المحلية",
                    rationale="ربط المحتوى بسياق البحرين والمواسم وسلوك الشراء المحلي.",
                    contentAngles=["مناسبات البحرين", "المجتمع", "قصص عربية", "شراكات محلية"],
                ),
            ],
            weeklyCadence=arabic_cadence(),
            kpis=[
                StrategyKpi(name="استفسارات إنستغرام المؤهلة", target="زيادة شهرية"),
                StrategyKpi(name="معدل التفاعل", target="اتجاه تصاعدي مستمر"),
                StrategyKpi(name="استمرارية المحتوى", target="3 إلى 5 منشورات أو ريلز أسبوعيًا"),
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
    return StrategyPlan(
        summary=(
            f"{request.horizon_days}-day Instagram-first strategy grounded in "
            f"Knowledge Vault context: {context_summary}."
        ),
        horizonDays=request.horizon_days,
        objectives=[
            objective,
            "Turn Knowledge Vault insights into repeatable content pillars.",
            "Build a consistent posting rhythm for Bahrain audiences.",
        ],
        pillars=[
            StrategyPillar(
                name="Proof and trust",
                rationale="Use the company story, offers, and customer needs to build credibility.",
                contentAngles=[
                    "customer outcomes",
                    "behind the scenes",
                    "before and after",
                    "founder point of view",
                ],
            ),
            StrategyPillar(
                name="Offer education",
                rationale="Explain products and services simply to reduce buying friction.",
                contentAngles=["product explainers", "comparisons", "FAQs", "how to choose"],
            ),
            StrategyPillar(
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
        weeklyCadence=english_cadence(),
        kpis=[
            StrategyKpi(name="qualified Instagram inquiries", target="increase month over month"),
            StrategyKpi(name="engagement rate", target="maintain an upward trend"),
            StrategyKpi(name="content consistency", target="3-5 feed posts or reels per week"),
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


def summarize_context(request: StrategyGenerateRequest) -> str:
    labels: list[str] = []

    for chunk in request.context:
        label = f"{chunk.section}/{chunk.key}"
        if label not in labels:
            labels.append(label)

    return ", ".join(labels[:5]) if labels else "available workspace context"


def english_cadence() -> list[StrategyWeek]:
    return [
        StrategyWeek(
            week=1,
            focus="Message clarity",
            actions=["confirm the core offer", "publish an introduction carousel"],
        ),
        StrategyWeek(
            week=2,
            focus="Audience learning",
            actions=["publish an FAQ reel", "collect recurring objections"],
        ),
        StrategyWeek(
            week=3,
            focus="Trust building",
            actions=["publish a proof post", "share a process story"],
        ),
        StrategyWeek(
            week=4,
            focus="Conversion loop",
            actions=["invite qualified inquiries", "review analytics and update the Vault"],
        ),
    ]


def arabic_cadence() -> list[StrategyWeek]:
    return [
        StrategyWeek(
            week=1,
            focus="وضوح الرسالة",
            actions=["تأكيد العرض الأساسي", "نشر كاروسيل تعريفي"],
        ),
        StrategyWeek(
            week=2,
            focus="فهم الجمهور",
            actions=["نشر ريل للأسئلة الشائعة", "جمع الاعتراضات المتكررة"],
        ),
        StrategyWeek(
            week=3,
            focus="بناء الثقة",
            actions=["نشر دليل اجتماعي", "مشاركة قصة من خلف الكواليس"],
        ),
        StrategyWeek(
            week=4,
            focus="تحسين التحويل",
            actions=["دعوة الجمهور للاستفسار", "مراجعة التحليلات وتحديث الخزنة"],
        ),
    ]
