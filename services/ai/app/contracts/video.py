from typing import Literal

from pydantic import Field, model_validator

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


class VideoTextCue(StrictContract):
    text: str = Field(min_length=1, max_length=160)
    start: float = Field(ge=0, lt=1)
    end: float = Field(gt=0, le=1)

    @model_validator(mode="after")
    def validate_interval(self) -> "VideoTextCue":
        if self.end <= self.start or not self.text.strip():
            raise ValueError("Text needs a nonempty display interval")
        return self


class VideoRenderPlan(StrictContract):
    visual_prompt: str = Field(min_length=3, max_length=4_000)
    text_cues: list[VideoTextCue] = Field(max_length=6)

    @model_validator(mode="after")
    def validate_cues(self) -> "VideoRenderPlan":
        end = 0.0
        for cue in self.text_cues:
            if cue.start < end:
                raise ValueError("Text cards must be ordered and cannot overlap")
            end = cue.end
        return self


class VideoPlanResponse(StrictContract):
    result: VideoRenderPlan
    model: str
    tokens_in: int = Field(ge=0)
    tokens_out: int = Field(ge=0)


class VideoDownloadRequest(VideoJobRequest):
    render_plan: VideoRenderPlan | None = None
    duration_seconds: VideoDurationSeconds = 8


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
