from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Locale = Literal["ar", "en"]
CampaignDurationDays = Literal[3, 7, 14, 30, 60, 90]
ShortText = Annotated[str, Field(min_length=1, max_length=500)]


class StrictContract(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class VaultContextChunk(StrictContract):
    section: str = Field(min_length=1, max_length=80)
    key: str = Field(min_length=1, max_length=120)
    value: dict[str, object]
    score: float = Field(default=0, ge=-1, le=1)


class CampaignPromptTemplate(StrictContract):
    body: str = Field(min_length=1, max_length=20_000)
    version: str = Field(min_length=1, max_length=120)


class CampaignPillar(StrictContract):
    name: str = Field(min_length=1, max_length=160)
    rationale: str = Field(min_length=1, max_length=1_000)
    content_angles: list[ShortText] = Field(
        alias="contentAngles",
        min_length=1,
        max_length=12,
    )


class CampaignWeek(StrictContract):
    week: int = Field(ge=1, le=26)
    focus: str = Field(min_length=1, max_length=300)
    actions: list[ShortText] = Field(min_length=1, max_length=12)


class CampaignKpi(StrictContract):
    name: str = Field(min_length=1, max_length=200)
    target: str = Field(min_length=1, max_length=500)


class GeneratedCampaignContent(StrictContract):
    summary: str = Field(min_length=1, max_length=2_000)
    objectives: list[ShortText] = Field(min_length=1, max_length=8)
    pillars: list[CampaignPillar] = Field(min_length=1, max_length=6)
    weekly_cadence: list[CampaignWeek] = Field(
        alias="weeklyCadence",
        min_length=1,
        max_length=26,
    )
    kpis: list[CampaignKpi] = Field(min_length=1, max_length=10)
    risks: list[ShortText] = Field(min_length=1, max_length=10)
    next_actions: list[ShortText] = Field(
        alias="nextActions",
        min_length=1,
        max_length=10,
    )


class CampaignPlan(GeneratedCampaignContent):
    duration_days: CampaignDurationDays = Field(alias="durationDays")
    publishes_per_day: int = Field(alias="publishesPerDay", ge=1, le=5)


class CampaignGenerateRequest(StrictContract):
    workspace_id: str = Field(min_length=1, max_length=120)
    objective: str | None = Field(default=None, min_length=3, max_length=500)
    duration_days: CampaignDurationDays = 30
    publishes_per_day: int = Field(default=1, ge=1, le=5)
    starts_at: datetime
    locale: Locale = "en"
    context: list[VaultContextChunk] = Field(default_factory=list, max_length=10)
    prompt_template: CampaignPromptTemplate | None = None
    model: str | None = Field(default=None, min_length=1, max_length=200)


class CampaignGenerateResponse(StrictContract):
    model: str = Field(min_length=1, max_length=200)
    prompt_version: str = Field(min_length=1, max_length=120)
    tokens_in: int = Field(ge=0)
    tokens_out: int = Field(ge=0)
    campaign: CampaignPlan
