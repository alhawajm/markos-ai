import asyncio
import base64

import pytest

from app.contracts.image import (
    ImageGenerateRequest,
    ImagePromptTemplate,
)
from app.core.errors import AiServiceError
from app.providers.image import (
    IMAGE_DIMENSIONS,
    ImagesApi,
    OpenAIImageProvider,
    RawImageData,
    RawImageResponse,
    RawImageUsage,
    build_local_jpeg,
    classify_image_status_error,
    validate_generated_jpeg,
)


class FakeImageData:
    def __init__(self, image_bytes: bytes) -> None:
        self.b64_json: str | None = base64.b64encode(image_bytes).decode("ascii")


class FakeUsage:
    input_tokens = 143
    output_tokens = 2_048


class FakeResponse:
    usage: RawImageUsage | None = FakeUsage()

    def __init__(self, image_bytes: bytes) -> None:
        self.data: list[RawImageData] | None = [FakeImageData(image_bytes)]


class FakeImages:
    def __init__(self, response: RawImageResponse) -> None:
        self.response = response
        self.last_kwargs: dict[str, object] | None = None

    async def generate(self, **kwargs: object) -> RawImageResponse:
        self.last_kwargs = kwargs
        return self.response


class FakeClient:
    def __init__(self, response: RawImageResponse) -> None:
        self.fake_images = FakeImages(response)
        self.images: ImagesApi = self.fake_images


def image_request() -> ImageGenerateRequest:
    return ImageGenerateRequest(
        workspace_id="workspace-secret-id",
        prompt="Editorial product photograph of Pearl Coffee for a Bahrain audience",
        aspect_ratio="4:5",
        prompt_template=ImagePromptTemplate(
            body="Use warm neutrals and restrained coral accents.",
            version="image.workspace.v2",
        ),
        model="gpt-image-configured",
    )


def test_openai_image_provider_requests_publish_ready_jpeg_and_exact_usage() -> None:
    request = image_request()
    width, height = IMAGE_DIMENSIONS[request.aspect_ratio]
    image_bytes = build_local_jpeg(request, width, height)
    client = FakeClient(FakeResponse(image_bytes))
    provider = OpenAIImageProvider(client=client)

    result = asyncio.run(provider.generate_image(request))
    kwargs = client.fake_images.last_kwargs

    assert kwargs is not None
    assert kwargs["model"] == "gpt-image-configured"
    assert kwargs["size"] == "1024x1280"
    assert kwargs["quality"] == "medium"
    assert kwargs["output_format"] == "jpeg"
    assert kwargs["output_compression"] == 90
    assert kwargs["moderation"] == "auto"
    assert kwargs["n"] == 1
    assert "workspace-secret-id" not in str(kwargs["prompt"])
    assert "Use warm neutrals" in str(kwargs["prompt"])
    assert kwargs["user"] != "workspace-secret-id"
    assert str(kwargs["user"]).startswith("markos-")
    assert result.prompt_version == "image.v2.openai"
    assert result.mime_type == "image/jpeg"
    assert result.filename.endswith(".jpg")
    assert result.width == width
    assert result.height == height
    assert result.tokens_in == 143
    assert result.tokens_out == 2_048
    validate_generated_jpeg(base64.b64decode(result.base64_data), (width, height))


def test_openai_image_provider_rejects_invalid_provider_bytes() -> None:
    provider = OpenAIImageProvider(client=FakeClient(FakeResponse(b"not a jpeg")))

    with pytest.raises(AiServiceError) as raised:
        asyncio.run(provider.generate_image(image_request()))

    assert raised.value.code == "AI_IMAGE_OUTPUT_INVALID"
    assert raised.value.retryable is True


def test_image_status_errors_distinguish_moderation_and_transient_failures() -> None:
    moderation = classify_image_status_error(400, "moderation_blocked")
    invalid_request = classify_image_status_error(400, "image_generation_user_error")
    unavailable = classify_image_status_error(500, None)

    assert moderation.code == "AI_IMAGE_MODERATION_BLOCKED"
    assert moderation.status_code == 422
    assert moderation.retryable is False
    assert invalid_request.code == "AI_IMAGE_REQUEST_REJECTED"
    assert invalid_request.retryable is False
    assert unavailable.code == "AI_PROVIDER_UNAVAILABLE"
    assert unavailable.retryable is True
