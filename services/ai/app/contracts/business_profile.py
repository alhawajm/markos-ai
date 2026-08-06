from pydantic import Field

from app.contracts.strategy import StrategyContextChunk, StrictContract


class LocalizedBusinessProfileText(StrictContract):
    en: str = Field(min_length=1, max_length=2_000)
    ar: str = Field(min_length=1, max_length=2_000)


class BusinessProfile(StrictContract):
    business_name: str = Field(alias="businessName", min_length=1, max_length=200)
    tagline: LocalizedBusinessProfileText
    overview: LocalizedBusinessProfileText
    unique_value: LocalizedBusinessProfileText = Field(alias="uniqueValue")
    offer_summary: LocalizedBusinessProfileText = Field(alias="offerSummary")
    ideal_customer: LocalizedBusinessProfileText = Field(alias="idealCustomer")
    market_position: LocalizedBusinessProfileText = Field(alias="marketPosition")
    brand_voice: LocalizedBusinessProfileText = Field(alias="brandVoice")
    marketing_focus: LocalizedBusinessProfileText = Field(alias="marketingFocus")


class BusinessProfileGenerateRequest(StrictContract):
    workspace_id: str = Field(min_length=1, max_length=120)
    context: list[StrategyContextChunk] = Field(min_length=1, max_length=20)
    model: str | None = Field(default=None, min_length=1, max_length=200)


class BusinessProfileGenerateResponse(StrictContract):
    model: str = Field(min_length=1, max_length=200)
    prompt_version: str = Field(min_length=1, max_length=120)
    tokens_in: int = Field(ge=0)
    tokens_out: int = Field(ge=0)
    profile: BusinessProfile
