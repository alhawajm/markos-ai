import { afterEach, describe, expect, it, vi } from "vitest";
import { AiServiceRequestError, requestAi } from "../src/ai/request";
import { env } from "../src/config/env";

describe("AI service request boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the internal service token and parses a successful response", async () => {
    const fetchMock = vi.fn(async (_url: URL, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;

      expect(headers.authorization).toBe(`Bearer ${env.INTERNAL_SERVICE_TOKEN}`);
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ value: 42 }), {
        headers: { "content-type": "application/json" },
        status: 200
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestAi("/ai/test", {
      body: { hello: "world" },
      parse: (value) => (value as { value: number }).value
    });

    expect(result).toBe(42);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("maps provider failures to a sanitized typed error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "AI_PROVIDER_RATE_LIMITED",
                details: [{ retryable: true }],
                message: "raw upstream message must not escape"
              }
            }),
            { headers: { "content-type": "application/json" }, status: 503 }
          )
      )
    );

    await expect(requestAi("/ai/test", { body: {} })).rejects.toMatchObject({
      code: "AI_PROVIDER_RATE_LIMITED",
      message: "The AI provider is temporarily rate limited",
      retryable: true,
      statusCode: 503
    } satisfies Partial<AiServiceRequestError>);
  });

  it("rejects a successful response that violates its runtime contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ invalid: true }), { status: 200 }))
    );

    await expect(
      requestAi("/ai/test", {
        body: {},
        parse: () => {
          throw new Error("invalid schema");
        }
      })
    ).rejects.toMatchObject({
      code: "AI_SERVICE_RESPONSE_INVALID",
      statusCode: 502
    });
  });

  it("preserves a sanitized invalid-output gateway status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "AI_OUTPUT_INVALID",
                details: [{ retryable: true }],
                message: "raw validation content"
              }
            }),
            { status: 502 }
          )
      )
    );

    await expect(requestAi("/ai/test", { body: {} })).rejects.toMatchObject({
      code: "AI_OUTPUT_INVALID",
      message: "The AI provider returned an invalid result",
      statusCode: 502
    });
  });
});
