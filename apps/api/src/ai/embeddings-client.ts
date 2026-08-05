import { requestAi } from "./request";

interface EmbeddingResponse {
  model: string;
  dimensions: number;
  embeddings: number[][];
}

export async function embedVaultTexts(texts: string[]): Promise<EmbeddingResponse> {
  const body = await requestAi<EmbeddingResponse>("/ai/vault/embed", { body: { texts } });

  if (body.embeddings.length !== texts.length || body.dimensions !== 1536) {
    throw new Error("AI embedding response does not match the Vault embedding contract");
  }

  return body;
}
