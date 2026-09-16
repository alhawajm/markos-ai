from typing import Annotated, Literal

from pydantic import Field, model_validator

from app.contracts.campaign import StrictContract
from app.contracts.content import ContentDraft

Reference = Annotated[str, Field(pattern=r"^(?:[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}|\$[a-zA-Z][a-zA-Z0-9_]{0,39})$")]
LocalReference = Annotated[str, Field(pattern=r"^\$[a-zA-Z][a-zA-Z0-9_]{0,39}$")]
AspectRatio = Literal["SQUARE", "PORTRAIT", "VERTICAL"]


class MediaMetadata(StrictContract):
    mimeType: str
    width: int | None
    height: int | None
    durationSeconds: float | None


class MediaItem(StrictContract):
    id: str
    position: int
    mediaKind: Literal["IMAGE", "VIDEO"] | None
    purpose: str | None
    title: str | None
    body: str | None
    visualDirection: str | None
    aspectRatio: AspectRatio | None
    generationDurationSeconds: int | None
    media: MediaMetadata | None


class ReelBeat(StrictContract):
    id: str
    position: int
    text: str


class ReelScript(StrictContract):
    id: str
    hook: str | None
    intendedDurationSeconds: int | None
    beats: list[ReelBeat]


class AuthoringSnapshot(StrictContract):
    id: str
    contentType: Literal["POST", "CAROUSEL", "REEL", "STORY"]
    revision: int = Field(gt=0)
    editable: bool
    caption: str
    contentPillar: str | None
    campaignGoal: str | None
    tone: str | None
    brief: str | None
    mediaItems: list[MediaItem]
    reelScript: ReelScript | None


class UpdateContent(StrictContract):
    type: Literal["updateContent"]
    field: Literal["caption", "contentPillar", "campaignGoal", "tone", "brief"]
    value: str | None = Field(max_length=2200)

    @model_validator(mode="after")
    def validate_value(self) -> "UpdateContent":
        if self.value is not None:
            limits = {"caption": 2200, "contentPillar": 160, "campaignGoal": 500, "tone": 200, "brief": 1000}
            if len(self.value) > limits[self.field]:
                raise ValueError("Field exceeds its maximum length")
            if self.field == "caption":
                ContentDraft.validate_caption_hashtags(self.value)
        return self


class UpdateMediaItem(StrictContract):
    type: Literal["updateMediaItem"]
    itemId: Reference
    field: Literal["mediaKind", "purpose", "title", "body", "visualDirection", "aspectRatio", "generationDurationSeconds"]
    value: str | int | None


class AddMediaItem(StrictContract):
    type: Literal["addMediaItem"]
    ref: LocalReference
    purpose: str | None = Field(max_length=160)
    title: str | None = Field(max_length=160)
    body: str | None = Field(max_length=800)
    visualDirection: str | None = Field(max_length=2000)


class RemoveMediaItem(StrictContract):
    type: Literal["removeMediaItem"]
    itemId: Reference


class ReorderMediaItems(StrictContract):
    type: Literal["reorderMediaItems"]
    orderedIds: list[Reference] = Field(min_length=1, max_length=100)


class UpdateReelScript(StrictContract):
    type: Literal["updateReelScript"]
    field: Literal["hook", "intendedDurationSeconds"]
    value: str | int | None


class AddReelBeat(StrictContract):
    type: Literal["addReelBeat"]
    ref: LocalReference
    text: str = Field(min_length=1, max_length=800)


class UpdateReelBeat(StrictContract):
    type: Literal["updateReelBeat"]
    beatId: Reference
    text: str = Field(max_length=800)


class RemoveReelBeat(StrictContract):
    type: Literal["removeReelBeat"]
    beatId: Reference


class ReorderReelBeats(StrictContract):
    type: Literal["reorderReelBeats"]
    orderedIds: list[Reference] = Field(min_length=1, max_length=100)


# A plain union produces provider-supported anyOf, rather than discriminator/oneOf.
AuthoringOperation = UpdateContent | UpdateMediaItem | AddMediaItem | RemoveMediaItem | ReorderMediaItems | UpdateReelScript | AddReelBeat | UpdateReelBeat | RemoveReelBeat | ReorderReelBeats


class Conversion(StrictContract):
    contentType: Literal["POST", "CAROUSEL", "REEL", "STORY"]
    retainMediaItemId: str | None


class GenerationRequest(StrictContract):
    itemId: Reference


class ConversationMessage(StrictContract):
    role: Literal["user", "assistant"]
    text: str = Field(max_length=8000)


class ConversationResult(StrictContract):
    reply: str = Field(min_length=1, max_length=6000)
    summary: str = Field(max_length=4000)
    conversion: Conversion | None
    operations: list[AuthoringOperation] = Field(max_length=50)
    generation: list[GenerationRequest] = Field(max_length=10)


class ConversationRequest(StrictContract):
    workspace_id: str
    locale: Literal["en", "ar"]
    message: str = Field(min_length=1, max_length=4000)
    current: AuthoringSnapshot
    context: dict[str, object]
    history: list[ConversationMessage] = Field(max_length=20)
    summary: str = Field(max_length=4000)
    model: str | None = None


class ConversationResponse(StrictContract):
    model: str
    prompt_version: str
    tokens_in: int = Field(ge=0)
    tokens_out: int = Field(ge=0)
    result: ConversationResult
