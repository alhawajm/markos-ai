import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LearningVisual(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    url: str


class InstagramLearningRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspace_id: str
    locale: Literal["en", "ar"]
    model: str | None = None
    evidence: dict[str, object]
    current: dict[str, object]
    visuals: list[LearningVisual] = Field(default_factory=list, max_length=10)


class LearningSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    field: Literal["toneWords", "voiceNotes", "aestheticWords", "contentDirection", "colors"]
    value: str | list[str]
    reasoning: str = Field(min_length=1, max_length=1200)
    sourcePostIds: list[str] = Field(max_length=10)

    @model_validator(mode="after")
    def field_shape(self) -> "LearningSuggestion":
        if self.field == "colors":
            if (
                not isinstance(self.value, list) or not 1 <= len(self.value) <= 7
                or any(not re.fullmatch(r"#[0-9a-fA-F]{6}", item) for item in self.value)
            ):
                raise ValueError("Use one to seven six-digit hex colors")
        elif self.field in {"toneWords", "aestheticWords"}:
            maximum = 4 if self.field == "toneWords" else 20
            if not isinstance(self.value, list) or len(self.value) > maximum:
                raise ValueError("Invalid list for field")
            if any(not item or len(item) > 80 for item in self.value):
                raise ValueError("Invalid list item")
        elif not isinstance(self.value, str) or len(self.value) > (
            1000 if self.field == "voiceNotes" else 2000
        ):
            raise ValueError("Invalid text for field")
        return self


class InstagramLearningResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str = Field(min_length=1, max_length=2000)
    limitations: list[str] = Field(max_length=12)
    suggestions: list[LearningSuggestion] = Field(max_length=5)


class InstagramLearningResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: str
    prompt_version: str
    tokens_in: int
    tokens_out: int
    result: InstagramLearningResult
