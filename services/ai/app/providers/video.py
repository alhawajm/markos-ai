import logging
from collections.abc import Awaitable
from functools import lru_cache
from typing import Protocol, TypeVar, cast

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AsyncOpenAI,
    AuthenticationError,
    OpenAIError,
    RateLimitError,
)

from app.contracts.video import VideoJobResponse, VideoStartRequest, VideoStatus
from app.core.config import settings
from app.core.errors import AiServiceError
from app.prompts.video import build_video_prompt
from app.providers.openai_structured import provider_error, safe_provider_detail

logger = logging.getLogger(__name__)
VIDEO_WIDTH = 720
VIDEO_HEIGHT = 1280
MAX_VIDEO_BYTES = 100_000_000
ProviderResult = TypeVar("ProviderResult")


class RawVideoError(Protocol):
    code: str | None
    message: str | None


class RawVideo(Protocol):
    id: str
    status: str
    progress: int | float | None
    model: str | None
    seconds: str | int | None
    size: str | None
    error: RawVideoError | None


class BinaryVideoResponse(Protocol):
    async def aread(self) -> bytes: ...


class VideosApi(Protocol):
    async def create(self, **kwargs: object) -> RawVideo: ...

    async def retrieve(self, video_id: str) -> RawVideo: ...

    async def download_content(self, video_id: str, **kwargs: object) -> BinaryVideoResponse: ...


class OpenAIVideoClient(Protocol):
    videos: VideosApi


class VideoProvider(Protocol):
    async def start(self, request: VideoStartRequest) -> VideoJobResponse: ...

    async def status(self, provider_job_id: str) -> VideoJobResponse: ...

    async def download(self, provider_job_id: str) -> bytes: ...


class DisabledVideoProvider:
    async def start(self, request: VideoStartRequest) -> VideoJobResponse:
        del request
        raise video_disabled_error()

    async def status(self, provider_job_id: str) -> VideoJobResponse:
        del provider_job_id
        raise video_disabled_error()

    async def download(self, provider_job_id: str) -> bytes:
        del provider_job_id
        raise video_disabled_error()


class OpenAIVideoProvider:
    def __init__(self, client: OpenAIVideoClient | None = None) -> None:
        if client is not None:
            self._client = client
            return

        if settings.openai_api_key is None:
            raise provider_error(
                code="AI_PROVIDER_NOT_CONFIGURED",
                message="The AI video provider is not configured",
                status_code=503,
                retryable=False,
            )

        self._client = cast(
            OpenAIVideoClient,
            AsyncOpenAI(
                api_key=settings.openai_api_key.get_secret_value(),
                max_retries=settings.openai_max_retries,
                timeout=settings.ai_video_timeout_seconds,
            ),
        )

    async def start(self, request: VideoStartRequest) -> VideoJobResponse:
        model = request.model or settings.video_model_primary
        if not model:
            raise provider_error(
                code="AI_PROVIDER_NOT_CONFIGURED",
                message="The video model is not configured",
                status_code=503,
                retryable=False,
            )

        logger.info(
            "openai_video_request_started model=%s seconds=%s size=720x1280",
            model,
            request.duration_seconds,
        )
        video = await call_video_provider(
            self._client.videos.create(
                model=model,
                prompt=build_video_prompt(request),
                seconds=str(request.duration_seconds),
                size="720x1280",
            )
        )
        return to_video_job_response(video, requested_model=model)

    async def status(self, provider_job_id: str) -> VideoJobResponse:
        video = await call_video_provider(self._client.videos.retrieve(provider_job_id))
        return to_video_job_response(video)

    async def download(self, provider_job_id: str) -> bytes:
        response = await call_video_provider(
            self._client.videos.download_content(
                provider_job_id,
                variant="video",
            )
        )
        content = await call_video_provider(response.aread())

        validate_generated_mp4(content)
        return content


@lru_cache(maxsize=1)
def get_video_provider() -> VideoProvider:
    if settings.ai_video_provider == "openai":
        return OpenAIVideoProvider()
    return DisabledVideoProvider()


def video_disabled_error() -> AiServiceError:
    return AiServiceError(
        code="AI_VIDEO_GENERATION_DISABLED",
        message="AI video generation is not available in this environment.",
        status_code=503,
        retryable=False,
    )


def to_video_job_response(
    video: RawVideo,
    requested_model: str | None = None,
) -> VideoJobResponse:
    status = video.status
    if status not in {"queued", "in_progress", "completed", "failed"}:
        raise provider_error(
            code="AI_VIDEO_RESPONSE_INVALID",
            message="The AI video provider returned an invalid job status",
            status_code=502,
            retryable=True,
        )

    width, height = parse_size(video.size)
    duration = parse_seconds(video.seconds)
    error_code = safe_provider_detail(getattr(video.error, "code", None))
    error_message = safe_provider_detail(getattr(video.error, "message", None))
    return VideoJobResponse(
        provider_job_id=video.id,
        status=cast(VideoStatus, status),
        progress=normalized_progress(video.progress, status),
        model=video.model or requested_model or settings.video_model_primary,
        duration_seconds=duration,
        width=width,
        height=height,
        error_code=error_code,
        error_message=error_message,
        retryable=(is_retryable_video_error(error_code) if status == "failed" else None),
    )


def validate_generated_mp4(content: bytes) -> None:
    if len(content) < 12 or len(content) > MAX_VIDEO_BYTES or content[4:8] != b"ftyp":
        raise provider_error(
            code="AI_VIDEO_OUTPUT_INVALID",
            message="The AI video provider returned an invalid MP4 file",
            status_code=502,
            retryable=True,
        )


def parse_size(value: str | None) -> tuple[int, int]:
    if value:
        pieces = value.lower().split("x", maxsplit=1)
        if len(pieces) == 2 and all(piece.isdigit() for piece in pieces):
            width, height = int(pieces[0]), int(pieces[1])
            if width > 0 and height > 0:
                return width, height
    return VIDEO_WIDTH, VIDEO_HEIGHT


def parse_seconds(value: str | int | None) -> int:
    try:
        seconds = int(value or 8)
    except (TypeError, ValueError):
        seconds = 8
    return seconds if seconds > 0 else 8


def normalized_progress(value: int | float | None, status: str) -> int:
    if status == "completed":
        return 100
    if value is None:
        return 0
    return max(0, min(99, round(float(value))))


def is_retryable_video_error(code: str | None) -> bool:
    return code not in {"moderation_blocked", "content_policy_violation", "invalid_prompt"}


async def call_video_provider(call: Awaitable[ProviderResult]) -> ProviderResult:
    try:
        return await call
    except APITimeoutError:
        raise provider_error(
            code="AI_PROVIDER_TIMEOUT",
            message="The AI video provider timed out",
            status_code=504,
            retryable=True,
        ) from None
    except RateLimitError:
        raise provider_error(
            code="AI_PROVIDER_RATE_LIMITED",
            message="The AI video provider is temporarily rate limited",
            status_code=503,
            retryable=True,
        ) from None
    except AuthenticationError:
        raise provider_error(
            code="AI_PROVIDER_NOT_CONFIGURED",
            message="The AI video provider credential is not accepted",
            status_code=503,
            retryable=False,
        ) from None
    except APIConnectionError:
        raise provider_error(
            code="AI_PROVIDER_UNAVAILABLE",
            message="The AI video provider is temporarily unavailable",
            status_code=503,
            retryable=True,
        ) from None
    except APIStatusError as error:
        code = safe_provider_detail(getattr(error, "code", None))
        if 400 <= error.status_code < 500:
            raise provider_error(
                code=(
                    "AI_VIDEO_MODERATION_BLOCKED"
                    if code in {"moderation_blocked", "content_policy_violation"}
                    else "AI_VIDEO_REQUEST_REJECTED"
                ),
                message=(
                    "The video request was blocked by the provider safety policy"
                    if code in {"moderation_blocked", "content_policy_violation"}
                    else "The AI video provider rejected this visual direction"
                ),
                status_code=422,
                retryable=False,
            ) from None
        raise provider_error(
            code="AI_PROVIDER_UNAVAILABLE",
            message="The AI video provider could not complete the request",
            status_code=503,
            retryable=True,
        ) from None
    except OpenAIError:
        raise provider_error(
            code="AI_PROVIDER_UNAVAILABLE",
            message="The AI video provider could not complete the request",
            status_code=503,
            retryable=True,
        ) from None
