import re
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from app.contracts.campaign import StrictContract, VaultContextChunk

ContentType = Literal["POST", "CAROUSEL", "STORY", "REEL"]
ContentLanguage = Literal["ar", "en"]
ContentText = Annotated[str, Field(max_length=2_200)]
ShortContentText = Annotated[str, Field(min_length=1, max_length=500)]


def default_preferred_languages() -> list[ContentLanguage]:
    return ["en", "ar"]


class ContentToneLock(StrictContract):
    preferred_languages: list[ContentLanguage] = Field(
        default_factory=default_preferred_languages, min_length=1, max_length=2
    )
    tone_words: list[ShortContentText] = Field(default_factory=list, max_length=20)
    voice_notes: str | None = Field(default=None, min_length=1, max_length=2_000)
    brand_hints: dict[str, object] = Field(default_factory=dict)

    @field_validator("preferred_languages")
    @classmethod
    def require_distinct_languages(cls, value: list[ContentLanguage]) -> list[ContentLanguage]:
        if len(value) != len(set(value)):
            raise ValueError("Preferred caption languages must be distinct")

        return value


class ContentPromptTemplate(StrictContract):
    body: str = Field(min_length=1, max_length=20_000)
    version: str = Field(min_length=1, max_length=120)


class CarouselSlide(StrictContract):
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=1, max_length=800)


class CarouselContent(StrictContract):
    slides: list[CarouselSlide] = Field(min_length=3, max_length=10)


class ReelScript(StrictContract):
    hook: str = Field(min_length=1, max_length=300)
    beats: list[ShortContentText] = Field(min_length=2, max_length=8)
    duration_seconds: int = Field(alias="durationSeconds", ge=5, le=90)


class ContentDraft(StrictContract):
    content_type: ContentType = Field(alias="contentType")
    caption: ContentText
    visual_direction: str | None = Field(
        default=None, alias="visualDirection", min_length=1, max_length=2_000
    )
    content_pillar: str | None = Field(
        default=None, alias="contentPillar", min_length=1, max_length=160
    )
    carousel: CarouselContent | None
    reel_script: ReelScript | None = Field(alias="reelScript")

    @field_validator("caption")
    @classmethod
    def validate_caption_hashtags(cls, value: str) -> str:
        # Same complete-caption policy as packages/shared-types/src/content-caption.ts.
        if len(re.findall(r"#[^\s#]+", value)) > 30:
            raise ValueError("Use 30 hashtags or fewer in the complete caption")
        return value


class ContentDraftBatch(StrictContract):
    drafts: list[ContentDraft] = Field(min_length=1, max_length=5)


class ContentGenerateRequest(StrictContract):
    workspace_id: str = Field(min_length=1, max_length=120)
    topic: str = Field(min_length=3, max_length=1_000)
    content_type: ContentType = "POST"
    count: int = Field(default=3, ge=1, le=5)
    context: list[VaultContextChunk] = Field(default_factory=list, max_length=10)
    tone_lock: ContentToneLock
    campaign: dict[str, object] | None = None
    revision_instruction: str | None = Field(default=None, min_length=3, max_length=1_000)
    current_draft: ContentDraft | None = None
    prompt_template: ContentPromptTemplate | None = None
    model: str | None = Field(default=None, min_length=1, max_length=200)

    @model_validator(mode="after")
    def require_complete_revision_context(self) -> "ContentGenerateRequest":
        if (self.revision_instruction is None) != (self.current_draft is None):
            raise ValueError("Revision instruction and current draft must be supplied together")

        return self


class ContentGenerateResponse(StrictContract):
    model: str = Field(min_length=1, max_length=200)
    prompt_version: str = Field(min_length=1, max_length=120)
    tokens_in: int = Field(ge=0)
    tokens_out: int = Field(ge=0)
    drafts: list[ContentDraft] = Field(min_length=1, max_length=5)
