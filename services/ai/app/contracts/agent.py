from typing import Annotated, Literal

from pydantic import Field

from app.contracts.campaign import CampaignPromptTemplate, StrictContract, VaultContextChunk

AgentName = Literal["MARKETING_STRATEGIST", "CONTENT_PLANNER", "CONTENT_CREATOR", "REEL_SCRIPT",
                    "IMAGE_PROMPT", "ANALYTICS_CONSULTANT", "RECOMMENDATION_ENGINE", "BUSINESS_GROWTH_ADVISOR"]
Text = Annotated[str, Field(min_length=1, max_length=2000)]
Texts = Annotated[list[Text], Field(max_length=12)]


class AgentRunRequest(StrictContract):
    workspace_id: str
    agent: AgentName
    task: str = Field(min_length=3, max_length=1000)
    locale: Literal["ar", "en"] = "en"
    context: list[VaultContextChunk] = Field(default_factory=list, max_length=10)
    inputs: dict[str, object] | None = None
    model: str | None = None
    prompt_template: CampaignPromptTemplate | None = None


class AgentRunResponse(StrictContract):
    model: str
    prompt_version: str
    tokens_in: int
    tokens_out: int
    output: dict[str, object]


class GroundedOutput(StrictContract):
    summary: Text
    sources: list[str] = Field(max_length=11, description="Only exact section/key identifiers supplied in context, or analyticsSummary when supplied")
    assumptions: Texts
    missingInformation: Texts


class Strategy(StrictContract):
    objectives: Texts
    pillars: Texts
    nextActions: Texts


class StrategistOutput(GroundedOutput):
    strategy: Strategy


class CalendarItem(StrictContract):
    week: int = Field(ge=1, le=13)
    contentType: Literal["POST", "CAROUSEL", "REEL", "STORY"]
    theme: Text
    bestTime: Text = Field(description="Proposed test time unless supported by actual audience activity")


class Distribution(StrictContract):
    POST: int = Field(ge=0, le=100)
    CAROUSEL: int = Field(ge=0, le=100)
    REEL: int = Field(ge=0, le=100)
    STORY: int = Field(ge=0, le=100)


class PlannerOutput(GroundedOutput):
    calendar: list[CalendarItem] = Field(min_length=1, max_length=28)
    distribution: Distribution


class Caption(StrictContract):
    caption: str = Field(min_length=1, max_length=2200)


class CreatorOutput(GroundedOutput):
    draft: Caption


class ReelScript(StrictContract):
    hook: Text
    beats: Texts
    cta: Text
    durationSeconds: int = Field(ge=4, le=90)


class ReelOutput(GroundedOutput):
    script: ReelScript


class ImagePrompt(StrictContract):
    prompt: Text
    negativePrompt: Text
    aspectRatio: Literal["4:5", "1:1", "9:16"]


class ImageOutput(GroundedOutput):
    imagePrompt: ImagePrompt


class Insight(StrictContract):
    metric: Text
    interpretation: Text


class AnalyticsOutput(GroundedOutput):
    insights: list[Insight] = Field(max_length=8)
    recommendations: Texts


class Recommendation(StrictContract):
    type: Literal["content", "timing", "campaign", "business"]
    action: Text


class RecommendationOutput(GroundedOutput):
    recommendations: list[Recommendation] = Field(min_length=1, max_length=8)


class GrowthOutput(GroundedOutput):
    advice: Texts
    risks: Texts
