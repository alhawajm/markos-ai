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
        prompt = f"{build_business_profile_instructions()}\n{build_business_profile_input(request)}"
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
    sections = {chunk.section: chunk.value for chunk in request.context}
    company = sections.get("COMPANY", {})
    products = sections.get("PRODUCTS", {})
    business_name = str(company.get("name") or "Your business")
    offer = product_text(products)

    return BusinessProfile(
        businessName=business_name,
        tagline=localized(
            f"A clear, customer-focused profile for {business_name}.",
            f"ملف واضح يركّز على عملاء {business_name}.",
        ),
        overview=localized(
            f"{business_name} offers {offer}."
            if offer
            else f"{business_name} is described using the confirmed business details.",
            f"يقدم {business_name}: {offer}."
            if offer
            else f"يتم وصف {business_name} استناداً إلى معلومات النشاط المؤكدة.",
        ),
        uniqueValue=localized(
            "Its distinct value follows the business story and differentiators provided."
            if "STORY" in sections
            else "What makes this business different has not been defined yet.",
            "تستند قيمته المميزة إلى قصة النشاط وعوامل التميز المذكورة."
            if "STORY" in sections
            else "لم يتم تحديد ما يميّز هذا النشاط بعد.",
        ),
        offerSummary=localized(
            product_summary(products, "The recorded offer includes: {summary}."),
            product_summary(products, "يشمل العرض المسجل: {summary}."),
        ),
        idealCustomer=localized(
            "The ideal customer follows the audience needs and motivations provided."
            if "AUDIENCE" in sections
            else "The ideal customer has not been defined yet.",
            "يتوافق العميل المثالي مع احتياجات الجمهور ودوافعه المذكورة."
            if "AUDIENCE" in sections
            else "لم يتم تحديد العميل المثالي بعد.",
        ),
        marketPosition=localized(
            "The market position reflects the competitors and advantages provided."
            if "COMPETITORS" in sections
            else "The business's market position has not been defined yet.",
            "يعكس الموقع في السوق المنافسين والمزايا المذكورة."
            if "COMPETITORS" in sections
            else "لم يتم تحديد موقع النشاط في السوق بعد.",
        ),
        brandVoice=localized(
            "The brand voice follows the selected tone and voice guidance."
            if "TONE" in sections
            else "The brand voice has not been defined yet.",
            "يتبع أسلوب العلامة النبرة وإرشادات الأسلوب المختارة."
            if "TONE" in sections
            else "لم يتم تحديد أسلوب العلامة بعد.",
        ),
        marketingFocus=localized(
            "The marketing focus follows the current priority and goals provided."
            if "OBJECTIVES" in sections
            else "The current marketing priority has not been defined yet.",
            "يتبع التركيز التسويقي الأولوية الحالية والأهداف المذكورة."
            if "OBJECTIVES" in sections
            else "لم يتم تحديد الأولوية التسويقية الحالية بعد.",
        ),
    )


def product_summary(products: dict[str, object], template: str) -> str:
    summary = product_text(products)
    if summary:
        return template.format(summary=summary)

    return "The products and services are recorded but need a clearer summary."


def product_text(products: dict[str, object]) -> str | None:
    summary = products.get("summary")
    if isinstance(summary, str) and summary.strip():
        return summary.strip().rstrip(".!?؟")

    items = products.get("items")
    if isinstance(items, list):
        names = [
            str(item.get("name")).strip()
            for item in items
            if isinstance(item, dict) and item.get("name")
        ]
        if names:
            return ", ".join(names[:5])

    return None


def localized(en: str, ar: str) -> LocalizedBusinessProfileText:
    return LocalizedBusinessProfileText(en=en, ar=ar)


def estimate_tokens(text: str) -> int:
    return max(1, len(re.findall(r"\S+", text)))
