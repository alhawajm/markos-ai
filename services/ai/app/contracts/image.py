from typing import Literal

from pydantic import Field

from app.contracts.campaign import StrictContract

ImageAspectRatio = Literal["1:1", "4:5", "9:16"]


class ImagePromptTemplate(StrictContract):
    body: str = Field(min_length=1, max_length=20_000)
    version: str = Field(min_length=1, max_length=120)


class ImageGenerateRequest(StrictContract):
    workspace_id: str = Field(min_length=1, max_length=120)
    prompt: str = Field(min_length=3, max_length=1_000)
    aspect_ratio: ImageAspectRatio = "4:5"
    prompt_template: ImagePromptTemplate | None = None
    model: str | None = Field(default=None, min_length=1, max_length=200)


class ImageGenerateResponse(StrictContract):
    model: str = Field(min_length=1, max_length=200)
    prompt_version: str = Field(min_length=1, max_length=120)
    tokens_in: int = Field(ge=0)
    tokens_out: int = Field(ge=0)
    prompt: str = Field(min_length=3, max_length=1_000)
    filename: str = Field(min_length=1, max_length=240)
    mime_type: Literal["image/jpeg"]
    base64_data: str = Field(min_length=1, max_length=12_000_000)
    size_bytes: int = Field(gt=0, le=8_000_000)
    width: int = Field(ge=320, le=1_440)
    height: int = Field(ge=320, le=2_560)
