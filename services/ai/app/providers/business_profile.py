import re
from functools import lru_cache
from typing import Protocol, cast

from openai import AsyncOpenAI

from app.contracts.business_profile import (
    BusinessProfile,
    BusinessProfileGenerateRequest,
    BusinessProfileGenerateResponse,
    LocalizedBusinessProfileText,
)
from app.core.config import settings
from app.core.errors import AiServiceError
from app.prompts.business_profile import (
    BUSINESS_PROFILE_PROMPT_VERSION,
    build_business_profile_input,
    build_business_profile_instructions,
)
from app.providers.openai_structured import OpenAIClient, generate_structured


class BusinessProfileProvider(Protocol):
    async def generate_profile(
        self,
        request: BusinessProfileGenerateRequest,
    ) -> BusinessProfileGenerateResponse: ...


class LocalBusinessProfileProvider:
    async def generate_profile(
        self,
        request: BusinessProfileGenerateRequest,
    ) -> BusinessProfileGenerateResponse:
        profile = build_local_profile(request)
        prompt = (
            f"{build_business_profile_instructions()}\n"
            f"{build_business_profile_input(request)}"
        )
        model = (
            request.model
            or settings.llm_longform_model
            or settings.llm_primary_model
            or "local-business-profile-resolver"
        )

        return BusinessProfileGenerateResponse(
            model=model,
            prompt_version=f"{BUSINESS_PROFILE_PROMPT_VERSION}.local",
            tokens_in=estimate_tokens(prompt),
            tokens_out=estimate_tokens(profile.model_dump_json(by_alias=True)),
            profile=profile,
        )


class OpenAIBusinessProfileProvider:
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

    async def generate_profile(
        self,
        request: BusinessProfileGenerateRequest,
    ) -> BusinessProfileGenerateResponse:
        model = request.model or settings.llm_longform_model or settings.llm_primary_model

        if not model:
            raise AiServiceError(
                code="AI_PROVIDER_NOT_CONFIGURED",
                message="The business profile model is not configured",
                status_code=503,
                retryable=False,
            )

        generated = await generate_structured(
            client=self._client,
            input_text=build_business_profile_input(request),
            instructions=build_business_profile_instructions(),
            model=model,
            output_label="business profile",
            schema=BusinessProfile,
            schema_name="markos_business_profile",
        )

        return BusinessProfileGenerateResponse(
            model=generated.model,
            prompt_version=f"{BUSINESS_PROFILE_PROMPT_VERSION}.openai",
            tokens_in=generated.tokens_in,
            tokens_out=generated.tokens_out,
            profile=generated.content,
        )


@lru_cache(maxsize=1)
def get_business_profile_provider() -> BusinessProfileProvider:
    if settings.ai_text_provider == "openai":
        return OpenAIBusinessProfileProvider()

    return LocalBusinessProfileProvider()


def build_local_profile(request: BusinessProfileGenerateRequest) -> BusinessProfile:
    company = next(
        (chunk.value for chunk in request.context if chunk.section == "COMPANY"),
        {},
    )
    business_name = str(company.get("name") or "Your business")
    context_labels = ", ".join(
        f"{chunk.section}/{chunk.key}" for chunk in request.context[:5]
    )
    source_summary = context_labels or "the supplied business details"

    return BusinessProfile(
        businessName=business_name,
        tagline=localized(
            f"A clear, customer-focused profile for {business_name}.",
            f"ملف واضح يركّز على عملاء {business_name}.",
        ),
        overview=localized(
            f"{business_name} is presented using {source_summary}.",
            f"يتم تقديم {business_name} استناداً إلى معلومات النشاط المحفوظة.",
        ),
        uniqueValue=localized(
            "Its value is grounded in the business story and stated differentiators.",
            "تستند قيمته المميزة إلى قصة النشاط وعوامل التميز المذكورة.",
        ),
        offerSummary=localized(
            "The offer reflects the products and services supplied during onboarding.",
            "يعكس العرض المنتجات والخدمات التي أُضيفت أثناء الإعداد.",
        ),
        idealCustomer=localized(
            "The ideal customer follows the audience needs and motivations in the Vault.",
            "يتوافق العميل المثالي مع احتياجات الجمهور ودوافعه في الخزنة.",
        ),
        marketPosition=localized(
            "The market position uses the recorded competitors and competitive advantage.",
            "يعتمد الموقع في السوق على المنافسين والميزة التنافسية المسجلة.",
        ),
        brandVoice=localized(
            "The voice follows the selected tone and brand guidance.",
            "يتبع أسلوب العلامة النبرة وإرشادات الهوية المختارة.",
        ),
        marketingFocus=localized(
            "The marketing focus follows the selected goals and 90-day definition of success.",
            "يتبع التركيز التسويقي الأهداف المختارة وتعريف النجاح خلال 90 يوماً.",
        ),
    )


def localized(en: str, ar: str) -> LocalizedBusinessProfileText:
    return LocalizedBusinessProfileText(en=en, ar=ar)


def estimate_tokens(text: str) -> int:
    return max(1, len(re.findall(r"\S+", text)))
