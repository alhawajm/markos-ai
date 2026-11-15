import { afterEach, describe, expect, it, vi } from "vitest";
import { instagramProfileUrl, extractPublicInstagramProfile, readPublicInstagramSource } from "../src/onboarding/instagram-profile-source";
const html = (user: object) => `<html><script type="application/json">${JSON.stringify({ data: { user } })}</script></html>`;
afterEach(() => vi.unstubAllGlobals());
describe("public Instagram onboarding source", () => {
  it("normalizes a public profile and removes tracking values", () =>
    expect(instagramProfileUrl("https://instagram.com/pearl.bakery/?utm=x#secret")).toEqual({
      url: "https://www.instagram.com/pearl.bakery/",
      username: "pearl.bakery"
    }));
  it.each([
    "http://instagram.com/pearl/",
    "https://127.0.0.1/pearl/",
    "https://instagram.com.attacker.test/pearl/",
    "https://instagram.com@attacker.test/pearl/",
    "https://www.instagram.com/p/123/",
    "https://instagram.com/accounts/",
    "https://instagram.com:8443/pearl/"
  ])("rejects unsafe or non-profile input %s", (url) => expect(() => instagramProfileUrl(url)).toThrow());
  it("requires a matching public account rather than unrelated data or a login wall", () => {
    expect(extractPublicInstagramProfile(html({ username: "pearl", is_private: false, biography: "Bakery" }), "pearl").biography).toBe("Bakery");
    expect(() => extractPublicInstagramProfile(html({ username: "other", is_private: false }), "pearl")).toThrow();
    expect(() => extractPublicInstagramProfile(html({ username: "pearl", is_private: true }), "pearl")).toThrow(/private/);
    expect(() => extractPublicInstagramProfile("<h1>Log in</h1>", "pearl")).toThrow(/not make/);
  });
  it("never follows redirects or fetches arbitrary image/website URLs from profile text", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        html({
          username: "pearl",
          is_private: false,
          biography: "Our bakery",
          external_url: "http://127.0.0.1/private",
          profile_pic_url_hd: "http://127.0.0.1/private"
        }),
        { headers: { "content-type": "text/html" } }
      )
    );
    vi.stubGlobal("fetch", fetch);
    const result = await readPublicInstagramSource("https://instagram.com/pearl/");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![1].redirect).toBe("manual");
    expect(result.files).toHaveLength(1);
    expect(Buffer.from(result.files[0]!.base64Data, "base64").toString()).toContain("No visual artwork was retrieved");
  });
  it("rejects a redirect/login response without returning fabricated business data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://www.instagram.com/accounts/login/" } })));
    await expect(readPublicInstagramSource("https://instagram.com/pearl/")).rejects.toThrow();
  });
});
