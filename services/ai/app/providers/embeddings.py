"""Versioned embedding spaces; deterministic vectors are restricted to local mode."""
import hashlib
import math
import re
from functools import lru_cache

from openai import APIStatusError, APITimeoutError, AsyncOpenAI, OpenAIError
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.errors import AiServiceError


class VaultEmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=50)
    model: str | None = None


class VaultEmbedResponse(BaseModel):
    model: str
    space: str
    dimensions: int
    tokens_in: int
    embeddings: list[list[float]]


def embedding_error(code: str, message: str, retryable: bool = False) -> AiServiceError:
    return AiServiceError(code=code, message=message, status_code=503, retryable=retryable)


def normalized(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    if not norm or not math.isfinite(norm):
        raise embedding_error("AI_EMBEDDING_INVALID", "The embedding provider returned an invalid vector")
    return [value / norm for value in vector]


def deterministic_embedding(text: str, dimensions: int) -> list[float]:
    vector = [0.0] * dimensions
    for token in re.findall(r"\w+", text.casefold()) or [text]:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        vector[int.from_bytes(digest[:4], "big") % dimensions] += 1 if digest[4] % 2 == 0 else -1
    return normalized(vector)


def byte_chunks(text: str) -> list[str]:
    # UTF-8 bytes upper-bound token counts. Preserve all text without cutting a Unicode character.
    chunks: list[str] = []
    buffer: list[str] = []
    size = 0
    for char in text:
        width = len(char.encode("utf-8"))
        if size + width > 6000:
            chunks.append("".join(buffer))
            buffer, size = [], 0
        buffer.append(char)
        size += width
    if buffer:
        chunks.append("".join(buffer))
    return chunks


@lru_cache(maxsize=1)
def embedding_client() -> AsyncOpenAI:
    if settings.openai_api_key is None or not settings.openai_api_key.get_secret_value():
        raise embedding_error("AI_PROVIDER_NOT_CONFIGURED", "Knowledge search requires an AI provider key")
    return AsyncOpenAI(api_key=settings.openai_api_key.get_secret_value(),
                       timeout=settings.openai_timeout_seconds, max_retries=0)


async def embed_texts(request: VaultEmbedRequest, client: AsyncOpenAI | None = None) -> VaultEmbedResponse:
    dimensions = settings.embedding_dimensions
    if dimensions != 1536:
        raise embedding_error("AI_EMBEDDING_CONFIG_INVALID", "Knowledge vectors require 1536 dimensions")
    if any(not text.strip() for text in request.texts) or sum(len(text.encode("utf-8")) for text in request.texts) > 240_000:
        raise AiServiceError(code="AI_EMBEDDING_INPUT_INVALID", message="Knowledge text is empty or exceeds the embedding batch limit", status_code=422, retryable=False)
    provider = settings.ai_embedding_provider or settings.ai_text_provider
    if provider == "local":
        return VaultEmbedResponse(model="local-hash-v1", space="local:hash-v1:1536", dimensions=dimensions,
                                  tokens_in=0, embeddings=[deterministic_embedding(text, dimensions) for text in request.texts])
    model = request.model or settings.embedding_model
    chunks = [byte_chunks(text) for text in request.texts]
    flattened = [chunk for group in chunks for chunk in group]
    try:
        result = await (client or embedding_client()).embeddings.create(
            model=model, input=flattened, dimensions=dimensions, encoding_format="float",
        )
    except APITimeoutError:
        raise embedding_error("AI_PROVIDER_TIMEOUT", "Knowledge indexing timed out", True) from None
    except APIStatusError as error:
        raise embedding_error("AI_PROVIDER_UNAVAILABLE", "Knowledge indexing is temporarily unavailable", error.status_code == 429 or error.status_code >= 500) from None
    except OpenAIError:
        raise embedding_error("AI_PROVIDER_UNAVAILABLE", "Knowledge indexing is temporarily unavailable", True) from None
    ordered = sorted(result.data, key=lambda item: item.index)
    if [item.index for item in ordered] != list(range(len(flattened))) or any(len(item.embedding) != dimensions or not all(math.isfinite(v) for v in item.embedding) for item in ordered):
        raise embedding_error("AI_EMBEDDING_INVALID", "Knowledge indexing returned invalid vectors")
    vectors: list[list[float]] = []
    offset = 0
    for group in chunks:
        weighted = [0.0] * dimensions
        for chunk, item in zip(group, ordered[offset:offset + len(group)], strict=True):
            weight = len(chunk.encode("utf-8"))
            for dimension, value in enumerate(item.embedding):
                weighted[dimension] += value * weight
        vectors.append(normalized(weighted))
        offset += len(group)
    return VaultEmbedResponse(model=result.model, space=f"openai:{result.model}:{dimensions}:mean-v1",
                              dimensions=dimensions, tokens_in=result.usage.prompt_tokens, embeddings=vectors)
