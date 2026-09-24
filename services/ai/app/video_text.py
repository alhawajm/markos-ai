"""Render real Unicode text with libass (HarfBuzz shaping and bidi), never AI pixels."""
import asyncio
import unicodedata
from pathlib import Path
from tempfile import TemporaryDirectory

from app.contracts.video import VideoRenderPlan
from app.core.config import settings
from app.core.errors import AiServiceError
from app.providers.video import validate_generated_mp4


def ass_time(seconds: float) -> str:
    ticks = round(seconds * 100)
    return f"{ticks // 360000}:{ticks // 6000 % 60:02}:{ticks // 100 % 60:02}.{ticks % 100:02}"


def ass_text(text: str) -> str:
    # Prevent user copy from introducing ASS overrides or newline commands.
    escaped = (text.replace("\\", "\\\u2060").replace("{", r"\{").replace("}", r"\}")
               .replace("\r\n", "\n").replace("\r", "\n"))
    lines = []
    for line in escaped.split("\n"):
        first_strong = next((unicodedata.bidirectional(c) for c in line
                             if unicodedata.bidirectional(c) in {"L", "R", "AL"}), "L")
        # ASS treats a bilingual event as one paragraph. Give each Arabic line
        # its own RTL embedding so leading dates/numbers keep the correct order.
        lines.append(f"\u202b{line}\u202c" if first_strong in {"R", "AL"} else line)
    return r"\N".join(lines)


def build_subtitles(plan: VideoRenderPlan, duration: int) -> str:
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{settings.video_text_font},44,&H00FFFFFF,&H00FFFFFF,&H00241B24,&H70241B24,0,0,0,0,100,100,0,0,1,2,1,2,64,96,280,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    for cue in plan.text_cues:
        size = 36 if len(cue.text) > 90 else 44
        header += (f"Dialogue: 0,{ass_time(cue.start * duration)},"
                   f"{ass_time(cue.end * duration)},Default,,0,0,0,,"
                   f"{{\\fs{size}}}{ass_text(cue.text)}\n")
    return header


async def render_video_text(video: bytes, plan: VideoRenderPlan, duration: int) -> bytes:
    if not plan.text_cues:
        return video
    with TemporaryDirectory(prefix="markos-video-") as folder:
        root = Path(folder)
        (root / "input.mp4").write_bytes(video)
        (root / "titles.ass").write_text(build_subtitles(plan, duration), encoding="utf-8")
        try:
            process = await asyncio.create_subprocess_exec(
                settings.video_ffmpeg_path, "-nostdin", "-hide_banner", "-loglevel", "error",
                "-i", "input.mp4", "-vf", "ass=titles.ass:shaping=complex",
                "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "fast",
                "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy",
                "-threads", "2", "-movflags", "+faststart", "-y", "output.mp4",
                cwd=root, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
            )
            try:
                await asyncio.wait_for(process.communicate(), timeout=90)
            except BaseException:
                if process.returncode is None:
                    process.kill()
                await process.communicate()
                raise
            if process.returncode != 0:
                raise OSError("Video text renderer failed")
            result = (root / "output.mp4").read_bytes()
            validate_generated_mp4(result)
            return result
        except (OSError, TimeoutError) as error:
            raise AiServiceError(
                code="AI_VIDEO_TEXT_RENDER_FAILED",
                message="Video text could not be rendered. The original footage is preserved.",
                status_code=503, retryable=True,
            ) from error
