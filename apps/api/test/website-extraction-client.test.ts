import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractWebsiteCandidatesWithAi,
  type WebsiteExtractionPage,
} from "../src/ai/website-extraction-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AI website extraction client", () => {
  it("retries invalid JSON once and requests a repaired strict response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("not-json", { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({
          model: "test-website-model",
          prompt_version: "website-extraction.v1.test",
          tokens_in: 21,
          tokens_out: 13,
          candidates: [supportedCandidate()],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await extractWebsiteCandidatesWithAi({
      workspaceId: "018ffd04-3f8a-7000-8000-000000000002",
      pages: [websitePage()],
    });

    expect(result).toMatchObject({
      model: "test-website-model",
      promptVersion: "website-extraction.v1.test",
      tokensIn: 21,
      tokensOut: 13,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBody(fetchMock, 0)).toMatchObject({ repair: false });
    expect(requestBody(fetchMock, 1)).toMatchObject({ repair: true });
  });

  it("refuses weakly evidenced claims after one repair attempt", async () => {
    const weakCandidate = {
      ...supportedCandidate(),
      sourceSnippet: "Fabricated market leadership claim",
    };
    const fetchMock = vi.fn(async () =>
      Response.json({
        model: "test-website-model",
        prompt_version: "website-extraction.v1.test",
        tokens_in: 18,
        tokens_out: 9,
        candidates: [weakCandidate],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      extractWebsiteCandidatesWithAi({
        workspaceId: "018ffd04-3f8a-7000-8000-000000000002",
        pages: [websitePage()],
      }),
    ).rejects.toThrow("no source-supported claims");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBody(fetchMock, 1)).toMatchObject({ repair: true });
  });

  it("requires evidence to exist on the candidate's declared source page", async () => {
    const misplacedCandidate = {
      ...supportedCandidate(),
      sourceSnippet: "Bridal collections and custom jewelry packages",
    };
    const fetchMock = vi.fn(async () =>
      Response.json({
        model: "test-website-model",
        prompt_version: "website-extraction.v1.test",
        tokens_in: 18,
        tokens_out: 9,
        candidates: [misplacedCandidate],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      extractWebsiteCandidatesWithAi({
        workspaceId: "018ffd04-3f8a-7000-8000-000000000002",
        pages: [
          websitePage(),
          {
            ...websitePage(),
            url: "https://brand.example/products",
            description: "Bridal collections and custom jewelry packages",
            paragraphs: ["Bridal collections and custom jewelry packages"],
          },
        ],
      }),
    ).rejects.toThrow("no source-supported claims");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function websitePage(): WebsiteExtractionPage {
  return {
    url: "https://brand.example/",
    title: "Raedat Jewelry",
    description: "Premium jewelry collections crafted for Bahrain businesses",
    headline: "Luxury Jewelry Collection",
    paragraphs: ["Premium jewelry collections crafted for Bahrain businesses"],
    links: ["Shop collection"],
    imageAlts: ["Gold jewelry collection"],
    colors: ["#78DAD1"],
  };
}

function supportedCandidate() {
  return {
    section: "COMPANY",
    key: "website-profile",
    value: { name: "Raedat Jewelry" },
    confidence: 0.86,
    sourceUrl: "https://brand.example/",
    sourceSnippet: "Premium jewelry collections crafted for Bahrain businesses",
    extractedAt: "2026-07-19T12:00:00.000Z",
  };
}

function requestBody(
  fetchMock: ReturnType<typeof vi.fn>,
  callIndex: number,
): Record<string, unknown> {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}
