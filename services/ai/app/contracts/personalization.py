from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class MemoryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: Literal["LANGUAGE", "TONE", "VISUAL_STYLE", "CONTENT_FORMAT", "WORKFLOW", "AVOID"]
    operation: Literal["REMEMBER", "FORGET"]
    text: str = Field(max_length=500)
    evidence: str = Field(min_length=1, max_length=1000)
