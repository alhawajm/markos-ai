from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Locale = Literal["ar", "en"]
ShortText = Annotated[str, Field(min_length=1, max_length=500)]


class StrictContract(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class StrategyContextChunk(StrictContract):
    section: str = Field(min_length=1, max_length=80)
    key: str = Field(min_length=1, max_length=120)
    value: dict[str, object]
    score: float = Field(default=0, ge=-1, le=1)


class StrategyPromptTemplate(StrictContract):
    body: str = Field(min_length=1, max_length=20_000)
    version: str = Field(min_length=1, max_length=120)


class StrategyPillar(StrictContract):
    name: str = Field(min_length=1, max_length=160)
    rationale: str = Field(min_length=1, max_length=1_000)
    content_angles: list[ShortText] = Field(
        alias="contentAngles",
        min_length=1,
        max_length=12,
    )


class StrategyWeek(StrictContract):
    week: int = Field(ge=1, le=26)
    focus: str = Field(min_length=1, max_length=300)
    actions: list[ShortText] = Field(min_length=1, max_length=12)


class StrategyKpi(StrictContract):
    name: str = Field(min_length=1, max_length=200)
    target: str = Field(min_length=1, max_length=500)


class GeneratedStrategyContent(StrictContract):
    summary: str = Field(min_length=1, max_length=2_000)
    objectives: list[ShortText] = Field(min_length=1, max_length=8)
    pillars: list[StrategyPillar] = Field(min_length=1, max_length=6)
    weekly_cadence: list[StrategyWeek] = Field(
        alias="weeklyCadence",
        min_length=1,
        max_length=26,
    )
    kpis: list[StrategyKpi] = Field(min_length=1, max_length=10)
    risks: list[ShortText] = Field(min_length=1, max_length=10)
    next_actions: list[ShortText] = Field(
        alias="nextActions",
        min_length=1,
        max_length=10,
    )


class StrategyPlan(GeneratedStrategyContent):
    horizon_days: int = Field(alias="horizonDays", ge=30, le=180)


class StrategyGenerateRequest(StrictContract):
    workspace_id: str = Field(min_length=1, max_length=120)
    objective: str | None = Field(default=None, min_length=3, max_length=500)
    horizon_days: int = Field(default=90, ge=30, le=180)
    locale: Locale = "en"
    context: list[StrategyContextChunk] = Field(default_factory=list, max_length=10)
    prompt_template: StrategyPromptTemplate | None = None
    model: str | None = Field(default=None, min_length=1, max_length=200)


class StrategyGenerateResponse(StrictContract):
    model: str = Field(min_length=1, max_length=200)
    prompt_version: str = Field(min_length=1, max_length=120)
    tokens_in: int = Field(ge=0)
    tokens_out: int = Field(ge=0)
    strategy: StrategyPlan
