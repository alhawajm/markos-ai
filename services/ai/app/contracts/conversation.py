from typing import Literal

from pydantic import Field, field_validator

from app.contracts.campaign import StrictContract
from app.contracts.content import CarouselContent, ContentDraft, ReelScript


class ConversationMessage(StrictContract):
    role: Literal["user", "assistant"]
    text: str = Field(max_length=8_000)


class ConversationChanges(StrictContract):
    caption: str | None = Field(max_length=2_200)
    brief: str | None = Field(max_length=1_000)
    visual_direction: str | None = Field(alias="visualDirection", max_length=2_000)
    carousel: CarouselContent | None
    reel_script: ReelScript | None = Field(alias="reelScript")

    @field_validator("caption")
    @classmethod
    def validate_caption(cls, value: str | None) -> str | None:
        return None if value is None else ContentDraft.validate_caption_hashtags(value)


class ConversationResult(StrictContract):
    reply: str = Field(min_length=1, max_length=6_000)
    changes: ConversationChanges | None
    summary: str = Field(max_length=4_000)


class ConversationRequest(StrictContract):
    workspace_id: str
    locale: Literal["en", "ar"]
    message: str = Field(min_length=1, max_length=4_000)
    current: dict[str, object]
    context: dict[str, object]
    history: list[ConversationMessage] = Field(max_length=20)
    summary: str = Field(max_length=4_000)
    model: str | None = None


class ConversationResponse(StrictContract):
    model: str
    prompt_version: str
    tokens_in: int = Field(ge=0)
    tokens_out: int = Field(ge=0)
    result: ConversationResult
