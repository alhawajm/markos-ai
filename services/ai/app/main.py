from datetime import UTC, datetime
import hashlib
import math
import re
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field

from app.core.config import settings


class HealthResponse(BaseModel):
    service: Literal["ai"]
    status: Literal["ok", "degraded"]
    timestamp: str


class VaultEmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=50)
    model: str | None = None


class VaultEmbedResponse(BaseModel):
    model: str
    dimensions: int
    embeddings: list[list[float]]


app = FastAPI(title="MARKOS AI Service", version="0.0.0")


@app.get("/ai/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        service="ai",
        status="ok",
        timestamp=datetime.now(UTC).isoformat(),
    )


@app.get("/ai/health/deep")
async def deep_health() -> dict[str, object]:
    return {
        "service": "ai",
        "status": "degraded",
        "timestamp": datetime.now(UTC).isoformat(),
        "dependencies": {
            "database": "not_checked",
            "providers": "not_checked",
            "embeddings": "not_checked",
        },
    }


@app.post("/ai/vault/embed", response_model=VaultEmbedResponse)
async def embed_vault(request: VaultEmbedRequest) -> VaultEmbedResponse:
    model = request.model or settings.embedding_model

    return VaultEmbedResponse(
        model=model,
        dimensions=settings.embedding_dimensions,
        embeddings=[deterministic_embedding(text, settings.embedding_dimensions) for text in request.texts],
    )


def deterministic_embedding(text: str, dimensions: int) -> list[float]:
    vector = [0.0 for _ in range(dimensions)]

    for token in re.findall(r"\w+", text.casefold()):
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimensions
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign

    norm = math.sqrt(sum(value * value for value in vector))

    if norm == 0:
        return vector

    return [value / norm for value in vector]
