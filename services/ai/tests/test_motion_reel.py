import base64
from io import BytesIO

import pytest
from PIL import Image
from pydantic import ValidationError

from app.contracts.video import MotionReelRequest
from app.core.errors import AiServiceError
from app.motion_reel import artwork_jpeg


def test_artwork_is_decoded_and_verified_before_ffmpeg() -> None:
    buffer = BytesIO()
    Image.new("RGB", (720, 1280), "pink").save(buffer, format="JPEG")
    data = artwork_jpeg(base64.b64encode(buffer.getvalue()).decode())
    with Image.open(BytesIO(data)) as image:
        assert image.size == (720, 1280)


@pytest.mark.parametrize("value", ["not-base64", base64.b64encode(b"not an image").decode()])
def test_invalid_artwork_rejected(value: str) -> None:
    with pytest.raises(AiServiceError):
        artwork_jpeg(value)


def test_copy_must_fit_readable_cards() -> None:
    with pytest.raises(ValidationError):
        MotionReelRequest(image_base64="abcd", duration_seconds=4, text_cards=["a", "b", "c"])
    with pytest.raises(ValidationError):
        MotionReelRequest(image_base64="abcd", text_cards=["a" * 161])
    text = "Blooms in Pink\nالتوعية بسرطان الثدي"
    assert MotionReelRequest(image_base64="abcd", text_cards=[text]).text_cards == [text]
