import base64
import binascii
import hashlib
import logging
from functools import lru_cache
from io import BytesIO
from typing import Protocol, cast

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AsyncOpenAI,
    AuthenticationError,
    OpenAIError,
    RateLimitError,
)
from PIL import Image as PillowImage

from app.contracts.image import (
    ImageAspectRatio,
    ImageGenerateRequest,
    ImageGenerateResponse,
)
from app.core.config import settings
from app.core.errors import AiServiceError
from app.prompts.image import IMAGE_PROMPT_VERSION, build_image_prompt
from app.providers.openai_structured import provider_error, safe_provider_detail

logger = logging.getLogger(__name__)

IMAGE_DIMENSIONS: dict[ImageAspectRatio, tuple[int, int]] = {
    "1:1": (1024, 1024),
    "4:5": (1024, 1280),
    "9:16": (1008, 1792),
}
MAX_GENERATED_IMAGE_BYTES = 8_000_000


class RawImageData(Protocol):
    b64_json: str | None


class RawImageUsage(Protocol):
    input_tokens: int
    output_tokens: int


class RawImageResponse(Protocol):
    data: list[RawImageData] | None
    usage: RawImageUsage | None


class ImagesApi(Protocol):
    async def generate(self, **kwargs: object) -> RawImageResponse: ...


class OpenAIImageClient(Protocol):
    images: ImagesApi


class ImageProvider(Protocol):
    async def generate_image(self, request: ImageGenerateRequest) -> ImageGenerateResponse: ...


class DisabledImageProvider:
    async def generate_image(self, request: ImageGenerateRequest) -> ImageGenerateResponse:
        del request
        raise AiServiceError(
            code="AI_IMAGE_GENERATION_DISABLED",
            message="AI image generation is not available in this environment. Upload an image instead.",
            status_code=503,
            retryable=False,
        )


class OpenAIImageProvider:
    def __init__(self, client: OpenAIImageClient | None = None) -> None:
        if client is not None:
            self._client = client
            return

        if settings.openai_api_key is None:
            raise AiServiceError(
                code="AI_PROVIDER_NOT_CONFIGURED",
                message="The AI image provider is not configured",
                status_code=503,
                retryable=False,
            )

        self._client = cast(
            OpenAIImageClient,
            AsyncOpenAI(
                api_key=settings.openai_api_key.get_secret_value(),
                max_retries=settings.openai_max_retries,
                timeout=settings.ai_image_timeout_seconds,
            ),
        )

    async def generate_image(self, request: ImageGenerateRequest) -> ImageGenerateResponse:
        requested_model = (
            request.model
            if request.model is not None and not request.model.startswith("local-")
            else None
        )
        model = requested_model or settings.image_model_primary

        if not model or model.startswith("local-"):
            raise AiServiceError(
                code="AI_PROVIDER_NOT_CONFIGURED",
                message="The image model is not configured",
                status_code=503,
                retryable=False,
            )

        width, height = IMAGE_DIMENSIONS[request.aspect_ratio]
        size = f"{width}x{height}"
        provider_prompt = build_image_prompt(request)
        user_identifier = (
            f"markos-{hashlib.sha256(request.workspace_id.encode('utf-8')).hexdigest()[:32]}"
        )
        logger.info(
            "openai_image_request_started model=%s size=%s quality=medium output_format=jpeg",
            model,
            size,
        )

        try:
            response = await self._client.images.generate(
                background="opaque",
                model=model,
                moderation="auto",
                n=1,
                output_compression=90,
                output_format="jpeg",
                prompt=provider_prompt,
                quality="medium",
                size=size,
                user=user_identifier,
            )
        except APITimeoutError as error:
            log_image_provider_failure(error)
            raise provider_error(
                code="AI_PROVIDER_TIMEOUT",
                message="The AI image provider timed out",
                status_code=504,
                retryable=True,
            ) from None
        except RateLimitError as error:
            log_image_provider_failure(error)
            raise provider_error(
                code="AI_PROVIDER_RATE_LIMITED",
                message="The AI image provider is temporarily rate limited",
                status_code=503,
                retryable=True,
            ) from None
        except AuthenticationError as error:
            log_image_provider_failure(error)
            raise provider_error(
                code="AI_PROVIDER_NOT_CONFIGURED",
                message="The AI image provider credential is not accepted",
                status_code=503,
                retryable=False,
            ) from None
        except APIConnectionError as error:
            log_image_provider_failure(error)
            raise provider_error(
                code="AI_PROVIDER_UNAVAILABLE",
                message="The AI image provider is temporarily unavailable",
                status_code=503,
                retryable=True,
            ) from None
        except APIStatusError as error:
            log_image_provider_failure(error)
            raise classify_image_status_error(
                error.status_code,
                safe_provider_detail(getattr(error, "code", None)),
            ) from None
        except OpenAIError as error:
            log_image_provider_failure(error)
            raise provider_error(
                code="AI_PROVIDER_UNAVAILABLE",
                message="The AI image provider could not complete the request",
                status_code=503,
                retryable=True,
            ) from None

        try:
            encoded = response.data[0].b64_json if response.data else None
            if not encoded:
                raise ValueError("missing image data")
            image_bytes = base64.b64decode(encoded, validate=True)
            validate_generated_jpeg(image_bytes, (width, height))
        except (binascii.Error, IndexError, OSError, TypeError, ValueError):
            logger.warning(
                "openai_image_response_rejected model=%s terminal_category=invalid_output request_id_present=%s",
                model,
                bool(getattr(response, "_request_id", None)),
            )
            raise provider_error(
                code="AI_IMAGE_OUTPUT_INVALID",
                message="The AI image provider returned an invalid image",
                status_code=502,
                retryable=True,
            ) from None

        if response.usage is None:
            logger.warning(
                "openai_image_response_rejected model=%s terminal_category=usage_missing request_id_present=%s",
                model,
                bool(getattr(response, "_request_id", None)),
            )
            raise provider_error(
                code="AI_PROVIDER_USAGE_MISSING",
                message="The AI image provider did not return usage data",
                status_code=502,
                retryable=False,
            )

        digest = hashlib.sha256(image_bytes).hexdigest()[:12]
        logger.info(
            "openai_image_request_completed model=%s size=%s terminal_category=completed request_id_present=%s tokens_in=%s tokens_out=%s",
            model,
            size,
            bool(getattr(response, "_request_id", None)),
            response.usage.input_tokens,
            response.usage.output_tokens,
        )

        return ImageGenerateResponse(
            model=model,
            prompt_version=f"{IMAGE_PROMPT_VERSION}.openai",
            tokens_in=response.usage.input_tokens,
            tokens_out=response.usage.output_tokens,
            prompt=request.prompt,
            filename=f"markos-ai-{digest}.jpg",
            mime_type="image/jpeg",
            base64_data=base64.b64encode(image_bytes).decode("ascii"),
            size_bytes=len(image_bytes),
            width=width,
            height=height,
        )


@lru_cache(maxsize=1)
def get_image_provider() -> ImageProvider:
    if settings.ai_image_provider == "openai":
        return OpenAIImageProvider()

    # Treat the legacy `local` selector as disabled. This prevents an older
    # environment value from silently restoring the synthetic bitmap pipeline.
    return DisabledImageProvider()


def classify_image_status_error(status_code: int, provider_code: str | None) -> AiServiceError:
    if provider_code in {"content_policy_violation", "moderation_blocked"}:
        return provider_error(
            code="AI_IMAGE_MODERATION_BLOCKED",
            message="The image request was blocked by the provider safety policy",
            status_code=422,
            retryable=False,
        )

    if 400 <= status_code < 500:
        return provider_error(
            code="AI_IMAGE_REQUEST_REJECTED",
            message="The AI image provider could not generate this request",
            status_code=422,
            retryable=False,
        )

    return provider_error(
        code="AI_PROVIDER_UNAVAILABLE",
        message="The AI image provider could not complete the request",
        status_code=503,
        retryable=True,
    )


def validate_generated_jpeg(image_bytes: bytes, expected_dimensions: tuple[int, int]) -> None:
    if not image_bytes or len(image_bytes) > MAX_GENERATED_IMAGE_BYTES:
        raise ValueError("invalid image size")

    with PillowImage.open(BytesIO(image_bytes)) as image:
        if image.format != "JPEG" or image.size != expected_dimensions:
            raise ValueError("invalid image format or dimensions")
        image.verify()


def log_image_provider_failure(error: BaseException) -> None:
    status_code = error.status_code if isinstance(error, APIStatusError) else None
    request_id_present = bool(error.request_id) if isinstance(error, APIStatusError) else False
    logger.warning(
        "openai_image_request_failed error_type=%s status_code=%s request_id_present=%s provider_error_type=%s provider_code=%s provider_param=%s",
        type(error).__name__,
        status_code,
        request_id_present,
        safe_provider_detail(getattr(error, "type", None)),
        safe_provider_detail(getattr(error, "code", None)),
        safe_provider_detail(getattr(error, "param", None)),
    )
