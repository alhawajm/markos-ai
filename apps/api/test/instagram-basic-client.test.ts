import { describe, expect, it } from "vitest";
import { InstagramBasicClient, InstagramProviderError, RECENT_MEDIA_LIMIT } from "../src/workspace/instagram-basic-client";

describe("Instagram basic provider boundary", () => {
  it("uses the documented exchanges and bounded versioned profile request", async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({
        url: String(input),
        ...(init?.method ? { method: init.method } : {}),
        ...(init?.body ? { body: String(init.body) } : {})
      });
      if (String(input).includes("api.instagram.com")) return response({ access_token: "short-secret", user_id: "account-1" });
      if (String(input).includes("/access_token")) return response({ access_token: "long-secret", expires_in: 5000 });
      return response({
        user_id: "professional-account-1",
        username: "markos_business",
        account_type: "BUSINESS",
        media: {
          data: Array.from({ length: 9 }, (_, index) => ({
            id: `media-${index}`,
            media_type: index % 2 ? "VIDEO" : "IMAGE",
            ...(index === 0 ? {} : { caption: `caption ${index}` }),
            media_url: `https://media.test/${index}`
          }))
        }
      });
    };
    const client = new InstagramBasicClient(fetcher);
    const short = await client.exchangeCode({
      appId: "app",
      appSecret: "secret",
      code: "code",
      redirectUri: "https://api.test/callback"
    });
    const long = await client.exchangeLongLived(short.accessToken, "secret");
    const profile = await client.profile(long.accessToken);
    expect(profile.media).toHaveLength(RECENT_MEDIA_LIMIT);
    expect(short.exchangeUserId).toBe("account-1");
    expect(profile.professionalAccountId).toBe("professional-account-1");
    expect(profile.media[0]).toEqual({
      id: "media-0",
      mediaType: "IMAGE",
      mediaUrl: "https://media.test/0"
    });
    expect(calls[0]).toMatchObject({
      url: "https://api.instagram.com/oauth/access_token",
      method: "POST"
    });
    expect(calls[0]?.body).toContain("redirect_uri=https%3A%2F%2Fapi.test%2Fcallback");
    expect(calls[1]?.url).toContain("https://graph.instagram.com/access_token?");
    expect(calls[2]?.url).toContain("https://graph.instagram.com/v25.0/me?");
    expect(calls[2]?.url).toContain("fields=user_id%2Cusername");
    expect(calls[2]?.url).not.toContain("fields=id%2C");
    expect(calls[2]?.url).toContain("media.limit%286%29");
  });

  it("supports an empty media response and sanitizes provider failures", async () => {
    const empty = new InstagramBasicClient(async () => response({ user_id: "1", username: "empty", media: { data: [] } }));
    await expect(empty.profile("secret-token")).resolves.toMatchObject({
      media: []
    });
    const failed = new InstagramBasicClient(async () => new Response(JSON.stringify({ error: { message: "token secret-token invalid" } }), { status: 401 }));
    await expect(failed.profile("secret-token")).rejects.toMatchObject({
      authorizationInvalid: true,
      diagnostic: { httpStatus: 401, retryable: false }
    });
    try {
      await failed.profile("secret-token");
    } catch (error) {
      expect(String(error)).not.toContain("secret-token");
    }
  });

  it("maps the documented data-wrapped professional account response", async () => {
    const client = new InstagramBasicClient(async () =>
      response({
        data: [
          {
            user_id: "documented-professional-id",
            username: "documented_username",
            media: { data: [] }
          }
        ]
      })
    );

    await expect(client.profile("secret-token")).resolves.toMatchObject({
      professionalAccountId: "documented-professional-id",
      username: "documented_username",
      media: []
    });
  });

  it("uses the unversioned refresh contract", async () => {
    let request = "";
    const client = new InstagramBasicClient(async (input, init) => {
      request = `${init?.method} ${String(input)}`;
      return response({ access_token: "replacement", expires_in: 3600 });
    });
    await expect(client.refresh("long-secret")).resolves.toEqual({
      accessToken: "replacement",
      expiresIn: 3600
    });
    expect(request).toContain("GET https://graph.instagram.com/refresh_access_token?");
    expect(request).toContain("grant_type=ig_refresh_token");
    expect(request).toContain("access_token=long-secret");
    expect(request).not.toContain("/v25.0/");
  });

  it.each([
    ["malformed", new InstagramBasicClient(async () => new Response("not-json")), "response_not_json", false],
    ["oversized", new InstagramBasicClient(async () => response({ user_id: "1", username: "x" }), { maxResponseBytes: 2 }), "response_too_large", false],
    [
      "timeout",
      new InstagramBasicClient(
        async (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
        { timeoutMs: 1 }
      ),
      "timeout",
      true
    ]
  ] as const)("sanitizes %s provider responses", async (_name, client, kind, retryable) => {
    await expect(client.profile("never-exposed")).rejects.toMatchObject({
      kind,
      diagnostic: { retryable }
    });
  });
});

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200 });
}
