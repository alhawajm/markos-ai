import base64
import shutil
from io import BytesIO
from typing import Literal

import pytest
from PIL import Image, ImageChops

from app.core.config import settings
from app.core.errors import AiServiceError
from app.post_artwork import PostArtworkRequest, render_post_artwork


@pytest.mark.parametrize(("ratio", "height"), [("1:1", 1080), ("4:5", 1350), ("3:4", 1440)])
def test_post_jpeg_preserves_requested_dimensions(ratio: Literal["1:1", "4:5", "3:4"], height: int) -> None:
    result = render_post_artwork(PostArtworkRequest(ratio=ratio, style="editorial", font="bold", title="", detail="", zoom=1, strokes=[]))
    with Image.open(BytesIO(result)) as decoded:
        assert decoded.format == "JPEG"
        assert decoded.size == (1080, height)


def test_photo_decode_rejects_an_invalid_source() -> None:
    with pytest.raises(AiServiceError) as error:
        render_post_artwork(PostArtworkRequest(
            ratio="4:5", style="soft", font="regular", title="", detail="", zoom=1, strokes=[], photo_base64="eA==",
        ))
    assert error.value.code == "AI_POST_ARTWORK_INVALID_PHOTO"


def test_post_text_edit_changes_the_text_region_and_keeps_the_photo() -> None:
    if not shutil.which(settings.video_ffmpeg_path):
        pytest.skip("ffmpeg with libass is needed for the artwork text integration check")
    photo = BytesIO()
    Image.new("RGB", (300, 350), (219, 101, 41)).save(photo, format="PNG")
    artwork = PostArtworkRequest(
        ratio="4:5", style="hybrid", font="bold", title="متجر الحرف", detail="08:00 – 22:00",
        zoom=1, strokes=[], photo_base64=base64.b64encode(photo.getvalue()).decode("ascii"),
    )
    before = Image.open(BytesIO(render_post_artwork(artwork))).convert("RGB")
    after = Image.open(BytesIO(render_post_artwork(artwork.model_copy(update={"title": "الفنون اليدوية"})))).convert("RGB")
    difference = ImageChops.difference(before, after)
    assert difference.getbbox() is not None
    assert difference.crop((0, 0, 1080, 600)).getbbox() is None
