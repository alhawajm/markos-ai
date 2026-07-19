import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("embedVaultTexts", () => {
  it("uses deterministic local embeddings outside production when the AI service is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("offline", { status: 503 }))
    );

    const { embedVaultTexts } = await import("../src/ai/embeddings-client");

    const first = await embedVaultTexts(["Luxury jewelry Bahrain", "Food delivery Bahrain"]);
    const second = await embedVaultTexts(["Luxury jewelry Bahrain"]);

    expect(first).toMatchObject({
      model: "local-dev-deterministic-embedding",
      dimensions: 1536
    });
    expect(first.embeddings).toHaveLength(2);
    expect(first.embeddings[0]).toHaveLength(1536);
    expect(vectorNorm(first.embeddings[0])).toBeCloseTo(1, 8);
    expect(first.embeddings[0]).toEqual(second.embeddings[0]);
    expect(first.embeddings[0]).not.toEqual(first.embeddings[1]);
  });

  it("does not use the local fallback in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("offline", { status: 503 }))
    );

    const { embedVaultTexts } = await import("../src/ai/embeddings-client");

    await expect(embedVaultTexts(["production must use the embedding service"])).rejects.toThrow(
      "AI embedding request failed with 503"
    );
  });

  it("rejects provider responses that violate the Vault embedding contract", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ model: "bad-provider", dimensions: 3, embeddings: [[1, 2, 3]] }), {
            headers: {
              "content-type": "application/json"
            },
            status: 200
          })
      )
    );

    const { embedVaultTexts } = await import("../src/ai/embeddings-client");

    await expect(embedVaultTexts(["invalid contract"])).rejects.toThrow(
      "AI embedding response does not match the Vault embedding contract"
    );
  });
});

function vectorNorm(vector: number[] | undefined): number {
  expect(vector).toBeDefined();

  return Math.sqrt((vector ?? []).reduce((sum, value) => sum + value * value, 0));
}
