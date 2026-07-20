import { env } from "../config/env";

interface EmbeddingResponse {
  model: string;
  dimensions: number;
  embeddings: number[][];
}

const embeddingDimensions = 1536;
const localDevEmbeddingModel = "local-dev-deterministic-embedding";

export async function embedVaultTexts(texts: string[]): Promise<EmbeddingResponse> {
  let response: Response;

  try {
    response = await fetch(new URL("/ai/vault/embed", env.AI_BASE_URL), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ texts })
    });
  } catch (error) {
    return localEmbeddingFallback(texts, error);
  }

  if (!response.ok) {
    return localEmbeddingFallback(texts, new Error(`AI embedding request failed with ${response.status}`));
  }

  const body = (await response.json()) as Partial<EmbeddingResponse>;

  if (!isEmbeddingResponse(body, texts.length)) {
    throw new Error("AI embedding response does not match the Vault embedding contract");
  }

  return body;
}

function localEmbeddingFallback(texts: string[], error: unknown): EmbeddingResponse {
  if (env.NODE_ENV === "production") {
    throw error instanceof Error ? error : new Error("AI embedding request failed");
  }

  return {
    model: localDevEmbeddingModel,
    dimensions: embeddingDimensions,
    embeddings: texts.map(createLocalEmbedding)
  };
}

function isEmbeddingResponse(value: Partial<EmbeddingResponse>, expectedCount: number): value is EmbeddingResponse {
  return (
    typeof value.model === "string" &&
    value.dimensions === embeddingDimensions &&
    Array.isArray(value.embeddings) &&
    value.embeddings.length === expectedCount &&
    value.embeddings.every(
      (embedding) =>
        Array.isArray(embedding) &&
        embedding.length === embeddingDimensions &&
        embedding.every((item) => typeof item === "number" && Number.isFinite(item))
    )
  );
}

function createLocalEmbedding(text: string): number[] {
  const vector = Array.from({ length: embeddingDimensions }, () => 0);
  const tokens = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const values = tokens.length === 0 ? [text.length === 0 ? "empty" : text] : tokens;

  values.forEach((token, position) => {
    const primaryIndex = hashText(`${token}:${position}`) % embeddingDimensions;
    const secondaryIndex = hashText(`${position}:${token}`) % embeddingDimensions;
    vector[primaryIndex] = (vector[primaryIndex] ?? 0) + 1;
    vector[secondaryIndex] = (vector[secondaryIndex] ?? 0) + 0.5;
  });

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (norm === 0) {
    vector[0] = 1;
    return vector;
  }

  return vector.map((value) => value / norm);
}

function hashText(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
