import asyncio
import json

import httpx
import pytest
from pydantic import SecretStr

from app.contracts.video import VideoStartRequest
from app.core.config import settings
from app.core.errors import AiServiceError
from app.providers import wan_video
from app.providers.wan_video import FalWanVideoProvider, decode_job, encode_job


@pytest.fixture(autouse=True)
def configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "fal_key", SecretStr("isolated-fake-key"))
    monkeypatch.setattr(settings, "internal_service_token", "isolated-job-signing-key")


@pytest.mark.parametrize("duration", [4, 8, 12])
def test_creates_portrait_jobs_and_recovers_after_model_configuration_changes(
    duration: int, monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[httpx.Request] = []
    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.headers["authorization"] == "Key isolated-fake-key"
        if request.method == "POST":
            body = json.loads(request.content)
            assert body["aspect_ratio"] == "9:16"
            assert body["enable_safety_checker"] and body["enable_output_safety_checker"]
            assert body["num_frames"] == duration * 12 + 1 <= 161
            assert body["frames_per_second"] == 12
            assert "no lettering" in body["prompt"]
            return httpx.Response(200, json={"request_id": "durable-request-123"})
        assert request.url.path == "/fal-ai/wan/requests/durable-request-123/status"
        return httpx.Response(200, json={"status": "COMPLETED"})
    provider = FalWanVideoProvider(httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    request = VideoStartRequest.model_validate({"workspace_id": "fixture", "prompt": "A pink garden", "duration_seconds": duration})
    started = asyncio.run(provider.start(request))
    assert len(started.provider_job_id) <= 240
    monkeypatch.setattr(settings, "wan_video_endpoint", "fal-ai/wan/future-version")
    completed = asyncio.run(provider.status(started.provider_job_id))
    assert completed.status == "completed" and completed.duration_seconds == duration
    assert completed.model == "fal-ai/wan/v2.2-a14b/text-to-video"
    assert len(requests) == 2


def test_lost_submission_is_never_retried_or_represented_as_a_failed_known_job() -> None:
    calls = 0
    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ReadTimeout("private provider response", request=request)
    provider = FalWanVideoProvider(httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    with pytest.raises(AiServiceError) as error:
        asyncio.run(provider.start(VideoStartRequest(workspace_id="fixture", prompt="A garden")))
    assert error.value.code == "AI_VIDEO_START_RESULT_UNKNOWN"
    assert error.value.retryable is False and calls == 1
    assert "private" not in str(error.value)


def test_job_receipt_cannot_be_modified_to_change_provider_path() -> None:
    valid = encode_job("fal-ai/wan/v2.2-a14b/text-to-video", "receipt", 8)
    assert decode_job(valid)[2] == 8
    with pytest.raises(AiServiceError):
        decode_job(valid[:-1] + ("0" if valid[-1] != "0" else "1"))
    with pytest.raises(AiServiceError):
        decode_job(encode_job("fal-ai/wan/../../other", "receipt", 8))


@pytest.mark.parametrize("url", ["http://127.0.0.1/key", "https://fal.media.evil.test/a", "https://user:pass@fal.media/a", "https://[invalid"])
def test_download_rejects_non_provider_locations_without_contacting_them(url: str) -> None:
    calls = 0
    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        assert request.url.host == "queue.fal.run"
        return httpx.Response(200, json={"video": {"url": url}})
    provider = FalWanVideoProvider(httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    with pytest.raises(AiServiceError) as error:
        asyncio.run(provider.download(encode_job(settings.wan_video_endpoint, "receipt", 8)))
    assert error.value.code == "AI_VIDEO_OUTPUT_INVALID" and calls == 1


def test_download_keeps_credentials_off_cdn_and_normalizes_before_attachment(monkeypatch: pytest.MonkeyPatch) -> None:
    video = b"\0\0\0\x18ftypmp42-footage"
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "queue.fal.run":
            return httpx.Response(200, json={"video": {"url": "https://v3.fal.media/files/example.mp4"}})
        assert "authorization" not in request.headers
        return httpx.Response(200, content=video)
    async def normalize(content: bytes, duration: int) -> bytes:
        assert content == video and duration == 8
        return b"normalized"
    monkeypatch.setattr(wan_video, "normalize_video", normalize)
    provider = FalWanVideoProvider(httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    assert asyncio.run(provider.download(encode_job(settings.wan_video_endpoint, "receipt", 8))) == b"normalized"


def test_failed_provider_job_is_sanitized_and_has_no_fake_progress() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"status": "COMPLETED", "error": "secret provider diagnostics"})
    provider = FalWanVideoProvider(httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    state = asyncio.run(provider.status(encode_job(settings.wan_video_endpoint, "receipt", 8)))
    assert state.status == "failed" and state.progress == 0
    assert "secret" not in (state.error_message or "")
