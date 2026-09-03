import asyncio

import pytest

from app.contracts.video import VideoJobResponse, VideoStartRequest
from app.core.errors import AiServiceError
from app.providers.video import (
    DisabledVideoProvider,
    OpenAIVideoProvider,
    RawVideo,
    RawVideoError,
    VideosApi,
    validate_generated_mp4,
)


class FakeVideo:
    def __init__(self) -> None:
        self.id: str = "video_123"
        self.status: str = "in_progress"
        self.progress: int | float | None = 42
        self.model: str | None = "sora-test"
        self.seconds: str | int | None = "8"
        self.size: str | None = "720x1280"
        self.error: RawVideoError | None = None


class FakeBinaryResponse:
    async def aread(self) -> bytes:
        return b"\x00\x00\x00\x18ftypmp42video"


class FakeVideos:
    def __init__(self) -> None:
        self.last_create: dict[str, object] | None = None

    async def create(self, **kwargs: object) -> RawVideo:
        self.last_create = kwargs
        return FakeVideo()

    async def retrieve(self, video_id: str) -> RawVideo:
        assert video_id == "video_123"
        return FakeVideo()

    async def download_content(self, video_id: str, **kwargs: object) -> FakeBinaryResponse:
        assert video_id == "video_123"
        assert kwargs == {"variant": "video"}
        return FakeBinaryResponse()


class FakeClient:
    def __init__(self) -> None:
        self.fake_videos = FakeVideos()
        self.videos: VideosApi = self.fake_videos


def video_request() -> VideoStartRequest:
    return VideoStartRequest(
        workspace_id="workspace-secret-id",
        prompt="A close-up of fresh pastry being plated in warm morning light",
        duration_seconds=8,
        model="sora-test",
    )


def test_disabled_video_provider_returns_an_honest_error() -> None:
    provider = DisabledVideoProvider()
    with pytest.raises(AiServiceError) as raised:
        asyncio.run(provider.start(video_request()))
    assert raised.value.code == "AI_VIDEO_GENERATION_DISABLED"
    assert raised.value.retryable is False


def test_openai_video_provider_starts_vertical_job_and_can_poll_and_download() -> None:
    client = FakeClient()
    provider = OpenAIVideoProvider(client=client)

    started = asyncio.run(provider.start(video_request()))
    polled = asyncio.run(provider.status("video_123"))
    downloaded = asyncio.run(provider.download("video_123"))

    assert client.fake_videos.last_create == {
        "model": "sora-test",
        "prompt": (
            "Create a polished, vertical social-media video for an Instagram Reel or Story. "
            "Use a 9:16 portrait composition, keep important subjects away from interface-safe "
            "areas, avoid logos and readable text unless explicitly requested, and do not invent "
            "claims about the business. Visual direction: A close-up of fresh pastry being plated "
            "in warm morning light"
        ),
        "seconds": "8",
        "size": "720x1280",
    }
    assert started == VideoJobResponse(
        provider_job_id="video_123",
        status="in_progress",
        progress=42,
        model="sora-test",
        duration_seconds=8,
        width=720,
        height=1280,
    )
    assert polled.provider_job_id == "video_123"
    validate_generated_mp4(downloaded)


def test_generated_video_must_be_an_mp4_container() -> None:
    with pytest.raises(AiServiceError) as raised:
        validate_generated_mp4(b"not an mp4")
    assert raised.value.code == "AI_VIDEO_OUTPUT_INVALID"
