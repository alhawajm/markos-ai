"""CPU-rendered artwork animation. No model call, generated footage, or provider fee."""
import asyncio
import base64
import binascii
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image, ImageOps, UnidentifiedImageError

from app.contracts.video import MotionReelRequest, VideoRenderPlan, VideoTextCue
from app.core.config import settings
from app.core.errors import AiServiceError
from app.providers.video import validate_generated_mp4
from app.video_text import build_subtitles


def motion_error(message: str) -> AiServiceError:
    return AiServiceError(code="MOTION_REEL_RENDER_FAILED", message=message, status_code=422, retryable=False)


def artwork_jpeg(encoded: str) -> bytes:
    try:
        raw = base64.b64decode(encoded, validate=True)
        if len(raw) > 8_000_000:
            raise ValueError("size")
        with Image.open(BytesIO(raw)) as original:
            if original.format != "JPEG" or original.width * original.height > 16_000_000:
                raise ValueError("image")
            original.load()
            output = BytesIO()
            ImageOps.exif_transpose(original).convert("RGB").save(output, format="JPEG", quality=95)
            return output.getvalue()
    except (ValueError, OSError, binascii.Error, UnidentifiedImageError, Image.DecompressionBombError):
        raise motion_error("Choose a valid JPEG artwork up to 8 MB and 16 megapixels") from None


async def render_motion_reel(request: MotionReelRequest) -> bytes:
    artwork = artwork_jpeg(request.image_base64)
    frames = request.duration_seconds * 24
    count = len(request.text_cards)
    plan = VideoRenderPlan(visual_prompt="Owner-uploaded artwork animation", text_cues=[
        VideoTextCue(text=text, start=index / count, end=(index + 1) / count)
        for index, text in enumerate(request.text_cards)
    ])
    with TemporaryDirectory(prefix="markos-motion-") as folder:
        root = Path(folder)
        (root / "artwork.jpg").write_bytes(artwork)
        (root / "titles.ass").write_text(build_subtitles(plan, request.duration_seconds), encoding="utf-8")
        # Letterbox the entire design, then add a small slow push-in inside the safe margins.
        filters = ("scale=660:1080:force_original_aspect_ratio=decrease,"
                   "pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=0x111C25,setsar=1,"
                   f"zoompan=z='1+0.025*on/{frames}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d={frames}:s=720x1280:fps=24,"
                   "fade=t=in:st=0:d=0.25,"
                   f"fade=t=out:st={request.duration_seconds - 0.3}:d=0.3")
        if request.text_cards:
            filters += ",ass=titles.ass:shaping=complex"
        try:
            process = await asyncio.create_subprocess_exec(settings.video_ffmpeg_path, "-nostdin", "-hide_banner", "-loglevel", "error",
                "-i", "artwork.jpg", "-vf", filters, "-t", str(request.duration_seconds), "-an",
                "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-threads", "2",
                "-movflags", "+faststart", "-y", "output.mp4", cwd=root,
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
            try:
                await asyncio.wait_for(process.communicate(), timeout=100)
            except BaseException:
                if process.returncode is None:
                    process.kill()
                    await process.wait()
                raise
            if process.returncode != 0:
                raise motion_error("The artwork could not be rendered into a Reel")
            video = (root / "output.mp4").read_bytes()
            validate_generated_mp4(video)
            return video
        except (OSError, TimeoutError):
            raise motion_error("Motion rendering could not finish; try again") from None
