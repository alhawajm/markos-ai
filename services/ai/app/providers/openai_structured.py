import logging
from dataclasses import dataclass
from typing import Generic, Protocol, TypeVar

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AuthenticationError,
    OpenAIError,
    RateLimitError,
)
from pydantic import BaseModel, ValidationError

from app.core.config import settings
from app.core.errors import AiServiceError

logger = logging.getLogger(__name__)


class ResponseUsage(Protocol):
    input_tokens: int
    output_tokens: int


class RawStructuredResponse(Protocol):
    model: str
    output_text: str
    status: str
    usage: ResponseUsage | None

    def model_dump(self) -> dict[str, object]: ...


class ResponsesApi(Protocol):
    async def create(self, **kwargs: object) -> RawStructuredResponse: ...


class OpenAIClient(Protocol):
    responses: ResponsesApi


ContractT = TypeVar("ContractT", bound=BaseModel)


@dataclass(frozen=True)
class StructuredResult(Generic[ContractT]):
    content: ContractT
    model: str
    tokens_in: int
    tokens_out: int


async def generate_structured(
    *,
    client: OpenAIClient,
    input_text: str,
    instructions: str,
    model: str,
    output_label: str,
    schema: type[ContractT],
    schema_name: str,
) -> StructuredResult[ContractT]:
    logger.info(
        "openai_structured_request_started schema=%s model=%s",
        schema_name,
        model,
    )

    try:
        response = await client.responses.create(
            input=input_text,
            instructions=instructions,
            max_output_tokens=settings.openai_max_output_tokens,
            model=model,
            reasoning={"effort": settings.openai_reasoning_effort},
            store=False,
            text={
                "format": {
                    "type": "json_schema",
                    "name": schema_name,
                    "schema": schema.model_json_schema(by_alias=True),
                    "strict": True,
                }
            },
        )
    except APITimeoutError as error:
        log_provider_failure(error, schema_name)
        raise provider_error(
            code="AI_PROVIDER_TIMEOUT",
            message="The AI provider timed out",
            status_code=504,
            retryable=True,
        ) from None
    except RateLimitError as error:
        log_provider_failure(error, schema_name)
        raise provider_error(
            code="AI_PROVIDER_RATE_LIMITED",
            message="The AI provider is temporarily rate limited",
            status_code=503,
            retryable=True,
        ) from None
    except AuthenticationError as error:
        log_provider_failure(error, schema_name)
        raise provider_error(
            code="AI_PROVIDER_NOT_CONFIGURED",
            message="The AI provider credential is not accepted",
            status_code=503,
            retryable=False,
        ) from None
    except APIConnectionError as error:
        log_provider_failure(error, schema_name)
        raise provider_error(
            code="AI_PROVIDER_UNAVAILABLE",
            message="The AI provider is temporarily unavailable",
            status_code=503,
            retryable=True,
        ) from None
    except APIStatusError as error:
        log_provider_failure(error, schema_name)
        raise provider_error(
            code="AI_PROVIDER_UNAVAILABLE",
            message="The AI provider could not complete the request",
            status_code=503,
            retryable=error.status_code >= 500,
        ) from None
    except OpenAIError as error:
        log_provider_failure(error, schema_name)
        raise provider_error(
            code="AI_PROVIDER_UNAVAILABLE",
            message="The AI provider could not complete the request",
            status_code=503,
            retryable=True,
        ) from None
    except (TypeError, ValueError, ValidationError) as error:
        log_provider_failure(error, schema_name)
        raise invalid_output_error(output_label) from None

    if response.status == "incomplete":
        log_response_rejection(response, schema_name, "incomplete")
        raise provider_error(
            code="AI_OUTPUT_INCOMPLETE",
            message=f"The AI provider returned an incomplete {output_label}",
            status_code=502,
            retryable=True,
        )

    if response.status != "completed":
        log_response_rejection(response, schema_name, "unexpected_status")
        raise provider_error(
            code="AI_PROVIDER_UNAVAILABLE",
            message="The AI provider could not complete the request",
            status_code=503,
            retryable=True,
        )

    if contains_refusal(response.model_dump()):
        log_response_rejection(response, schema_name, "refusal")
        raise provider_error(
            code="AI_OUTPUT_REFUSED",
            message=f"The AI provider could not generate this {output_label}",
            status_code=422,
            retryable=False,
        )

    try:
        content = schema.model_validate_json(response.output_text)
    except (TypeError, ValueError, ValidationError):
        log_response_rejection(response, schema_name, "invalid_output")
        raise invalid_output_error(output_label) from None

    if response.usage is None:
        log_response_rejection(response, schema_name, "usage_missing")
        raise provider_error(
            code="AI_PROVIDER_USAGE_MISSING",
            message="The AI provider did not return usage data",
            status_code=502,
            retryable=False,
        )

    logger.info(
        "openai_structured_request_completed schema=%s model=%s status=%s terminal_category=completed request_id_present=%s tokens_in=%s tokens_out=%s",
        schema_name,
        response.model,
        response.status,
        bool(getattr(response, "_request_id", None)),
        response.usage.input_tokens,
        response.usage.output_tokens,
    )

    return StructuredResult(
        content=content,
        model=response.model,
        tokens_in=response.usage.input_tokens,
        tokens_out=response.usage.output_tokens,
    )


def log_provider_failure(error: BaseException, schema_name: str) -> None:
    status_code = error.status_code if isinstance(error, APIStatusError) else None
    request_id_present = bool(error.request_id) if isinstance(error, APIStatusError) else False
    cause_type = type(error.__cause__).__name__ if error.__cause__ is not None else None
    logger.warning(
        "openai_structured_request_failed schema=%s error_type=%s status_code=%s cause_type=%s request_id_present=%s",
        schema_name,
        type(error).__name__,
        status_code,
        cause_type,
        request_id_present,
    )


def log_response_rejection(
    response: RawStructuredResponse,
    schema_name: str,
    terminal_category: str,
) -> None:
    usage = response.usage
    logger.warning(
        "openai_structured_response_rejected schema=%s model=%s status=%s terminal_category=%s request_id_present=%s tokens_in=%s tokens_out=%s",
        schema_name,
        response.model,
        response.status,
        terminal_category,
        bool(getattr(response, "_request_id", None)),
        usage.input_tokens if usage is not None else None,
        usage.output_tokens if usage is not None else None,
    )


def invalid_output_error(output_label: str) -> AiServiceError:
    return provider_error(
        code="AI_OUTPUT_INVALID",
        message=f"The AI provider returned an invalid {output_label}",
        status_code=502,
        retryable=True,
    )


def provider_error(
    *,
    code: str,
    message: str,
    status_code: int,
    retryable: bool,
) -> AiServiceError:
    return AiServiceError(
        code=code,
        message=message,
        status_code=status_code,
        retryable=retryable,
    )


def contains_refusal(value: object) -> bool:
    if isinstance(value, dict):
        if value.get("type") == "refusal":
            return True
        return any(contains_refusal(item) for item in value.values())

    if isinstance(value, list):
        return any(contains_refusal(item) for item in value)

    return False
