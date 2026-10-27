"""Apache-2.0 Wan inference on fal's durable GPU queue; never synthetic fallback."""

import asyncio
import base64
import hashlib
import hmac
import json
import re
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit

import httpx

from app.contracts.video import VideoJobResponse, VideoStartRequest, VideoStatus
from app.core.config import settings
from app.core.errors import AiServiceError
from app.prompts.video import build_video_prompt
from app.providers.video import MAX_VIDEO_BYTES, validate_generated_mp4


def video_error(code: str, message: str, *, retryable: bool = False) -> AiServiceError:
    return AiServiceError(code=code, message=message, status_code=503, retryable=retryable)


def encode_job(endpoint: str, request_id: str, duration: int) -> str:
    raw = json.dumps([endpoint, request_id, duration], separators=(",", ":")).encode()
    payload = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    signature = hmac.new(settings.internal_service_token.encode(), raw, hashlib.sha256).hexdigest()[:32]
    return f"wan1:{payload}:{signature}"


def decode_job(job_id: str) -> tuple[str, str, int]:
    try:
        prefix, payload, signature = job_id.split(":")
        raw = base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))
        expected = hmac.new(settings.internal_service_token.encode(), raw, hashlib.sha256).hexdigest()[:32]
        if prefix != "wan1" or not hmac.compare_digest(signature, expected):
            raise ValueError("signature")
        endpoint, request_id, duration = json.loads(raw)
        if not isinstance(endpoint, str) or not re.fullmatch(r"fal-ai/wan/[a-zA-Z0-9./-]{1,75}", endpoint):
            raise ValueError("endpoint")
        if ".." in endpoint or not isinstance(request_id, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", request_id):
            raise ValueError("request")
        if type(duration) is not int or duration not in {4, 8, 12}:
            raise ValueError("duration")
        return endpoint, request_id, duration
    except (ValueError, TypeError, json.JSONDecodeError):
        raise video_error("AI_VIDEO_JOB_INVALID", "The saved video job is invalid") from None


class FalWanVideoProvider:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        if not settings.fal_key or not settings.fal_key.get_secret_value().strip():
            raise video_error("AI_PROVIDER_NOT_CONFIGURED", "Wan video hosting is not configured")
        self._key = settings.fal_key.get_secret_value()
        # No HTTP retry transport: an ambiguous creation response must not create a second job.
        self._client = client or httpx.AsyncClient(timeout=settings.ai_video_timeout_seconds, follow_redirects=False)

    async def _json(self, method: str, path: str, body: dict[str, object] | None = None) -> dict[str, object]:
        try:
            response = await self._client.request(
                method, f"https://queue.fal.run/{path}",
                headers={"Authorization": f"Key {self._key}"}, json=body,
            )
        except httpx.HTTPError:
            raise video_error(
                "AI_VIDEO_START_RESULT_UNKNOWN" if method == "POST" else "AI_PROVIDER_UNAVAILABLE",
                "The video request could not be confirmed" if method == "POST" else "Video status is temporarily unavailable",
                retryable=method != "POST",
            ) from None
        if response.status_code in {401, 403}:
            raise video_error("AI_PROVIDER_NOT_CONFIGURED", "The video hosting credential is not accepted")
        if response.status_code == 429:
            raise video_error("AI_PROVIDER_RATE_LIMITED", "Video hosting is temporarily rate limited", retryable=True)
        if response.status_code >= 500:
            raise video_error(
                "AI_VIDEO_START_RESULT_UNKNOWN" if method == "POST" else "AI_PROVIDER_UNAVAILABLE",
                "Video hosting could not confirm the request", retryable=method != "POST",
            )
        if response.status_code >= 400:
            raise video_error("AI_VIDEO_REQUEST_REJECTED", "Video hosting rejected the request; review the visual direction or hosting account")
        try:
            data = response.json()
            if not isinstance(data, dict):
                raise ValueError("object expected")
            return data
        except (ValueError, TypeError):
            raise video_error("AI_VIDEO_RESPONSE_INVALID", "Video hosting returned an invalid response") from None

    async def start(self, request: VideoStartRequest) -> VideoJobResponse:
        endpoint = settings.wan_video_endpoint
        # Validate the configured endpoint before an authenticated outbound request.
        decode_job(encode_job(endpoint, "validation", request.duration_seconds))
        result = await self._json("POST", endpoint, {
            "prompt": build_video_prompt(request),
            "negative_prompt": "text, subtitles, lettering, watermark, logos, distorted hands, low quality",
            "aspect_ratio": "9:16", "resolution": "720p",
            # 12 generated fps + interpolation supports all existing durations within 161 frames.
            "num_frames": request.duration_seconds * 12 + 1, "frames_per_second": 12,
            "interpolator_model": "film", "num_interpolated_frames": 1,
            "adjust_fps_for_interpolation": True,
            "num_inference_steps": settings.wan_video_inference_steps,
            "enable_safety_checker": True, "enable_output_safety_checker": True,
            "enable_prompt_expansion": False, "video_quality": "high",
        })
        request_id = result.get("request_id")
        if not isinstance(request_id, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", request_id):
            raise video_error("AI_VIDEO_START_RESULT_UNKNOWN", "Video hosting did not return a usable receipt; automatic resubmission was stopped")
        job_id = encode_job(endpoint, request_id, request.duration_seconds)
        if len(job_id) > 240:
            raise video_error("AI_VIDEO_START_RESULT_UNKNOWN", "Video hosting returned an oversized receipt")
        return self._state(job_id, "queued")

    @staticmethod
    def _state(job_id: str, status: VideoStatus, error: bool = False) -> VideoJobResponse:
        endpoint, _, duration = decode_job(job_id)
        return VideoJobResponse(
            provider_job_id=job_id, status=status, progress=100 if status == "completed" else 0,
            model=endpoint, duration_seconds=duration, width=720, height=1280,
            error_code="AI_VIDEO_GENERATION_FAILED" if error else None,
            error_message="Video generation failed; review the visual direction and try again" if error else None,
            retryable=False if error else None,
        )

    async def status(self, provider_job_id: str) -> VideoJobResponse:
        endpoint, request_id, _ = decode_job(provider_job_id)
        queue_app = "/".join(endpoint.split("/")[:2])
        result = await self._json("GET", f"{queue_app}/requests/{request_id}/status")
        state = result.get("status")
        if state == "COMPLETED" and result.get("error"):
            return self._state(provider_job_id, "failed", error=True)
        statuses: dict[str, VideoStatus] = {"IN_QUEUE": "queued", "IN_PROGRESS": "in_progress", "COMPLETED": "completed"}
        if not isinstance(state, str) or state not in statuses:
            raise video_error("AI_VIDEO_RESPONSE_INVALID", "Video hosting returned an unknown job state")
        return self._state(provider_job_id, statuses[state])

    async def download(self, provider_job_id: str) -> bytes:
        endpoint, request_id, duration = decode_job(provider_job_id)
        queue_app = "/".join(endpoint.split("/")[:2])
        result = await self._json("GET", f"{queue_app}/requests/{request_id}")
        video = result.get("video")
        url = video.get("url") if isinstance(video, dict) else None
        if not isinstance(url, str):
            raise video_error("AI_VIDEO_OUTPUT_INVALID", "Video hosting did not return a video file")
        try:
            parsed = urlsplit(url)
            valid = (parsed.scheme == "https" and not parsed.username and not parsed.password
                     and parsed.port in {None, 443} and not parsed.fragment
                     and (parsed.hostname == "fal.media" or (parsed.hostname or "").endswith(".fal.media")))
        except ValueError:
            valid = False
        if not valid:
            raise video_error("AI_VIDEO_OUTPUT_INVALID", "Video hosting returned an unsupported file location")
        try:
            # Credentials go only to queue.fal.run, never the media CDN. No redirects or unbounded reads.
            async with self._client.stream("GET", url, follow_redirects=False) as response:
                if response.status_code != 200:
                    raise video_error("AI_VIDEO_OUTPUT_UNAVAILABLE", "The generated video is temporarily unavailable", retryable=True)
                chunks: list[bytes] = []
                size = 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > MAX_VIDEO_BYTES:
                        raise video_error("AI_VIDEO_OUTPUT_INVALID", "The generated video exceeds the supported size")
                    chunks.append(chunk)
        except httpx.HTTPError:
            raise video_error("AI_VIDEO_OUTPUT_UNAVAILABLE", "The generated video download was interrupted", retryable=True) from None
        content = b"".join(chunks)
        validate_generated_mp4(content)
        return await normalize_video(content, duration)


async def normalize_video(content: bytes, duration: int) -> bytes:
    """Trim the extra generated frame; preserve composition and output exact supported dimensions."""
    with TemporaryDirectory(prefix="markos-wan-") as folder:
        root = Path(folder)
        (root / "input.mp4").write_bytes(content)
        try:
            process = await asyncio.create_subprocess_exec(
                settings.video_ffmpeg_path, "-nostdin", "-hide_banner", "-loglevel", "error",
                "-i", "input.mp4", "-t", str(duration), "-an", "-vf",
                "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24",
                "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
                "-threads", "2", "-movflags", "+faststart", "-y", "output.mp4",
                cwd=root, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
            )
            try:
                await asyncio.wait_for(process.communicate(), timeout=90)
            except BaseException:
                if process.returncode is None:
                    process.kill()
                    await process.wait()
                raise
            if process.returncode != 0:
                raise video_error("AI_VIDEO_OUTPUT_INVALID", "The generated footage could not be prepared")
            output = (root / "output.mp4").read_bytes()
            validate_generated_mp4(output)
            return output
        except (OSError, TimeoutError):
            raise video_error("AI_VIDEO_OUTPUT_INVALID", "Video preparation could not finish") from None
