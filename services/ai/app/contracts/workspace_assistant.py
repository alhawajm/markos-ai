from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class WorkspaceProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["CONTENT", "EDIT_CONTENT", "CAMPAIGN", "STRATEGY"]
    summary: str = Field(min_length=1, max_length=1000)
    instruction: str = Field(min_length=1, max_length=3500)
    contentType: Literal["POST", "CAROUSEL", "REEL", "STORY"] | None
    contentItemId: str | None
    durationDays: Literal[3, 7, 14, 30, 60, 90] | None
    startsAt: str | None
    publishesPerDay: Literal[1, 2, 3] | None


class WorkspaceAssistantResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reply: str = Field(min_length=1, max_length=4000)
    proposal: WorkspaceProposal | None


class WorkspaceAssistantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspace_id: str
    message: str = Field(min_length=1, max_length=4000)
    locale: Literal["en", "ar"]
    model: str | None = None
    context: dict[str, Any]
    history: list[dict[str, str]] = Field(default_factory=list, max_length=20)


class WorkspaceAssistantResponse(BaseModel):
    model: str
    prompt_version: str
    tokens_in: int
    tokens_out: int
    result: WorkspaceAssistantResult
