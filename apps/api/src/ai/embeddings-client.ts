import { env } from "../config/env";

interface EmbeddingResponse {
  model: string;
  dimensions: number;
  embeddings: number[][];
}

export async function embedVaultTexts(texts: string[]): Promise<EmbeddingResponse> {
  const response = await fetch(new URL("/ai/vault/embed", env.AI_BASE_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ texts })
  });

  if (!response.ok) {
    throw new Error(`AI embedding request failed with ${response.status}`);
  }

  const body = (await response.json()) as EmbeddingResponse;

  if (body.embeddings.length !== texts.length || body.dimensions !== 1536) {
    throw new Error("AI embedding response does not match the Vault embedding contract");
  }

  return body;
}
