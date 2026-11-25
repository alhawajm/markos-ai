"""Render editable post layers to the same JPEG used for preview and publication."""
import base64
import binascii
import subprocess
from io import BytesIO
from math import ceil
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Literal

from PIL import Image, ImageDraw, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import settings
from app.core.errors import AiServiceError
from app.video_text import ass_text


class Point(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class PostArtworkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ratio: Literal["1:1", "4:5", "3:4"]
    style: Literal["editorial", "soft", "hybrid"]
    font: Literal["regular", "bold", "compact"]
    title: str = Field(max_length=100)
    detail: str = Field(max_length=190)
    zoom: float = Field(ge=1, le=2)
    strokes: list[list[Point]] = Field(max_length=16)
    photo_base64: str | None = Field(default=None, max_length=10_666_668)


def _background(request: PostArtworkRequest, width: int, height: int) -> Image.Image:
    if request.photo_base64:
        try:
            data = base64.b64decode(request.photo_base64, validate=True)
            if len(data) > 8_000_000:
                raise ValueError("Photo is too large")
            with Image.open(BytesIO(data), formats=["JPEG", "PNG", "WEBP"]) as opened:
                if opened.width * opened.height > 30_000_000:
                    raise ValueError("Photo dimensions are too large")
                original = ImageOps.exif_transpose(opened).convert("RGB")
            w, h = original.size
            crop_w, crop_h = w / request.zoom, h / request.zoom
            box = (round((w - crop_w) / 2), round((h - crop_h) / 2),
                   round((w + crop_w) / 2), round((h + crop_h) / 2))
            return ImageOps.fit(original.crop(box), (width, height), Image.Resampling.LANCZOS)
        except (ValueError, OSError, binascii.Error, UnidentifiedImageError, Image.DecompressionBombError) as error:
            raise AiServiceError(code="AI_POST_ARTWORK_INVALID_PHOTO", message="Choose a valid JPG, PNG or WebP photo under 8 MB.", status_code=422, retryable=False) from error
    palettes = {
        "editorial": ((39, 69, 66), (16, 29, 30)),
        "soft": ((110, 154, 143), (38, 76, 67)),
        "hybrid": ((55, 126, 141), (22, 49, 56)),
    }
    top, bottom = palettes[request.style]
    gradient = Image.new("RGB", (1, height))
    rows = [tuple(round(a + (b - a) * y / max(1, height - 1)) for a, b in zip(top, bottom, strict=True)) for y in range(height)]
    gradient.putdata(rows)
    return gradient.resize((width, height), Image.Resampling.NEAREST)


def _subtitles(request: PostArtworkRequest, width: int, height: int) -> str:
    # libass uses HarfBuzz and FriBidi for mixed Arabic and Latin copy.
    font = "DejaVu Sans" if request.font != "compact" else "DejaVu Sans Condensed"
    title_size = 64 if len(request.title) <= 44 else 48
    detail_size = 36 if len(request.detail) <= 86 else 30
    if "\n" in request.title or len(request.title) > 74:
        title_size = min(title_size, 42)
    detail_lines = sum(max(1, ceil(len(line) / 45)) for line in request.detail.splitlines())
    detail_margin = round(height * 0.065)
    title_margin = detail_margin + ceil(detail_lines * detail_size * 1.25) + (22 if detail_lines else 0)
    return f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Title,{font},{title_size},&H00FFFFFF,&H00FFFFFF,&H30141924,&H80141924,{-1 if request.font == "bold" else 0},0,0,0,100,100,0,0,1,2,0,2,72,72,{title_margin},1
Style: Detail,{font},{detail_size},&H00FFFFFF,&H00FFFFFF,&H30141924,&H80141924,0,0,0,0,100,100,0,0,1,1,0,2,72,72,{detail_margin},1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
Dialogue: 0,0:00:00.00,0:00:01.00,Title,,0,0,0,,{ass_text(request.title)}
Dialogue: 1,0:00:00.00,0:00:01.00,Detail,,0,0,0,,{ass_text(request.detail)}
"""


def render_post_artwork(request: PostArtworkRequest) -> bytes:
    width, height = 1080, {"1:1": 1080, "4:5": 1350, "3:4": 1440}[request.ratio]
    image = _background(request, width, height)
    if request.title or request.detail:
        strength = {"editorial": 210, "soft": 132, "hybrid": 178}[request.style]
        alpha = Image.new("L", (1, height))
        alpha.putdata([round(strength * max(0, (y / height - 0.44) / 0.56)) for y in range(height)])
        image.paste((15, 24, 27), (0, 0, width, height), alpha.resize((width, height)))
    draw = ImageDraw.Draw(image)
    for stroke in request.strokes:
        if not 2 <= len(stroke) <= 250:
            raise AiServiceError(code="AI_POST_ARTWORK_INVALID", message="Invalid markup stroke.", status_code=422, retryable=False)
        draw.line([(round(point.x * (width - 1)), round(point.y * (height - 1))) for point in stroke],
                  fill=(133, 235, 222), width=12, joint="curve")
    if not (request.title or request.detail):
        output = BytesIO()
        image.save(output, format="JPEG", quality=92)
        return output.getvalue()
    with TemporaryDirectory(prefix="markos-post-") as folder:
        root = Path(folder)
        image.save(root / "art.png")
        (root / "text.ass").write_text(_subtitles(request, width, height), encoding="utf-8")
        try:
            subprocess.run(
                [settings.video_ffmpeg_path, "-nostdin", "-hide_banner", "-loglevel", "error", "-i", "art.png",
                 "-vf", "ass=text.ass:shaping=complex", "-frames:v", "1", "-threads", "1", "-q:v", "2", "-y", "post.jpg"],
                cwd=root, check=True, timeout=20, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            return (root / "post.jpg").read_bytes()
        except (OSError, subprocess.SubprocessError) as error:
            raise AiServiceError(code="AI_POST_ARTWORK_RENDER_FAILED", message="Could not render the artwork.", status_code=503, retryable=True) from error
