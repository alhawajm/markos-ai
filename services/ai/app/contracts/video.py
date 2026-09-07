from typing import Literal

from pydantic import Field

from app.contracts.campaign import StrictContract

VideoDurationSeconds = Literal[4, 8, 12]
VideoStatus = Literal["queued", "in_progress", "completed", "failed"]


class VideoStartRequest(StrictContract):
    workspace_id: str = Field(min_length=1, max_length=120)
    prompt: str = Field(min_length=3, max_length=4_000)
    duration_seconds: VideoDurationSeconds = 8
    model: str | None = Field(default=None, min_length=1, max_length=200)


class VideoJobRequest(StrictContract):
    provider_job_id: str = Field(min_length=1, max_length=240)


class VideoJobResponse(StrictContract):
    provider_job_id: str = Field(min_length=1, max_length=240)
    status: VideoStatus
    progress: int = Field(ge=0, le=100)
    model: str = Field(min_length=1, max_length=200)
    duration_seconds: int = Field(ge=1, le=60)
    width: int = Field(ge=320, le=2_560)
    height: int = Field(ge=320, le=2_560)
    error_code: str | None = Field(default=None, max_length=160)
    error_message: str | None = Field(default=None, max_length=500)
    retryable: bool | None = None
