import { describe, expect, it } from "vitest";
import { collectInstagramEvidence, instagramMediaUrl, selectLearningPosts } from "../src/instagram-learning/evidence";
import { InstagramGraphClient } from "../src/workspace/instagram-graph-client";
import type { InstagramLearningPost } from "@markos/shared-types";

describe("initial Instagram evidence", () => {
  it("selects five latest and five distinct strongest, retaining measured zero", () => {
    const posts: InstagramLearningPost[] = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      caption: "",
      timestamp: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      mediaType: "FEED",
      selection: "LATEST",
      metrics: { likes: 12 - i, shares: i === 0 ? 100 : 0 }
    }));
    const selected = selectLearningPosts([...posts, posts[0]!]);
    expect(selected).toHaveLength(10);
    expect(new Set(selected.map((post) => post.id)).size).toBe(10);
    expect(selected.slice(0, 5).map((post) => post.id)).toEqual(["11", "10", "9", "8", "7"]);
    expect(selected[5]?.id).toBe("0");
    expect(selected[0]?.metrics.shares).toBe(0);
    expect(selected[0]?.metrics.views).toBeUndefined();
  });
  it("retains small-account content when insights are unavailable", () => {
    const posts: InstagramLearningPost[] = Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      caption: "Owner caption",
      timestamp: `2026-01-0${i + 1}T00:00:00Z`,
      mediaType: "FEED",
      selection: "LATEST",
      metrics: {}
    }));
    expect(selectLearningPosts(posts)).toHaveLength(8);
  });
  it("uses Instagram Login v25, safe cursor pagination, and individual metric fallback", async () => {
    const paths: string[] = [];
    const client = new InstagramGraphClient({
      fetchImpl: async (value, init) => {
        const url = new URL(value);
        expect(url.origin).toBe("https://graph.instagram.com");
        expect(url.pathname).toMatch(/^\/v25\.0\//);
        expect(url.searchParams.has("access_token")).toBe(false);
        expect(init?.headers).toMatchObject({ Authorization: "Bearer private-test-token" });
        paths.push(url.pathname);
        if (url.pathname.endsWith("/media"))
          return Response.json({
            data: [
              {
                id: url.searchParams.has("after") ? "b" : "a",
                timestamp: "2026-01-01T12:00:00Z",
                media_type: url.searchParams.has("after") ? "VIDEO" : "CAROUSEL_ALBUM",
                media_product_type: url.searchParams.has("after") ? "REELS" : "FEED",
                caption: "العربية / English",
                media_url: "https://scontent.cdninstagram.com/cover.jpg?signature=private",
                thumbnail_url: "https://video.fbcdn.net/cover.jpg",
                permalink: "https://www.instagram.com/p/a/"
              }
            ],
            ...(url.searchParams.has("after") ? {} : { paging: { cursors: { after: "cursor" }, next: "https://evil.example/steal-token" } })
          });
        if (url.pathname.endsWith("/insights")) {
          const metric = url.searchParams.get("metric")!;
          if (metric.includes(",") || metric === "views") return Response.json({ error: { code: 100 } }, { status: 400 });
          return Response.json({ data: [{ name: metric, values: [{ value: 0 }] }] });
        }
        const field = url.searchParams.get("fields")!;
        if (field === "website") return Response.json({ error: { code: 100 } }, { status: 400 });
        return Response.json({ [field]: field.includes("count") ? 2 : "Business" });
      }
    });
    const { evidence, visuals } = await collectInstagramEvidence({ accountId: "account", username: "test", accessToken: "private-test-token" }, client);
    expect(evidence.discovered).toBe(2);
    expect(evidence.historyComplete).toBe(true);
    expect(evidence.posts).toHaveLength(2);
    expect(evidence.posts.map((post) => post.mediaType).sort()).toEqual(["CAROUSEL_ALBUM", "REELS"]);
    expect(evidence.posts[0]?.metrics.saves).toBe(0);
    expect(evidence.posts[0]?.metrics.views).toBeUndefined();
    expect(evidence.warnings).toContain("METRIC_UNAVAILABLE:views");
    expect(evidence.warnings).toContain("PROFILE_UNAVAILABLE:website");
    expect(JSON.stringify(evidence)).not.toContain("signature");
    expect(visuals).toHaveLength(2);
    expect(paths.filter((path) => path.endsWith("/media"))).toHaveLength(2);
  });
  it("caps discovery and requests and exposes partial provider failure", async () => {
    let calls = 0;
    const client = new InstagramGraphClient({
      fetchImpl: async (value) => {
        calls++;
        const url = new URL(value);
        if (url.pathname.endsWith("/media"))
          return Response.json({
            data: Array.from({ length: 70 }, (_, i) => ({
              id: String(i),
              media_type: "IMAGE",
              timestamp: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
              caption: "Test",
              like_count: 0
            })),
            paging: { next: "ignored", cursors: { after: "more" } }
          });
        if (url.pathname.endsWith("/insights")) return Response.json({ error: { code: 4 } }, { status: 429 });
        return Response.json({});
      }
    });
    const { evidence } = await collectInstagramEvidence({ accountId: "account", username: "test", accessToken: "token" }, client);
    expect(evidence.discovered).toBe(50);
    expect(evidence.historyComplete).toBe(false);
    expect(evidence.warnings).toContain("INSIGHTS_PARTIAL");
    expect(evidence.warnings).toContain("BOUNDED_HISTORY");
    // Six optional profile reads, one media page, at most three in-flight insights reads.
    expect(calls).toBeLessThanOrEqual(10);
  });
  it("accepts only provider-owned HTTPS cover URLs", () => {
    expect(instagramMediaUrl("https://images.fbcdn.net/image.jpg")).toBeTruthy();
    for (const value of [
      "http://images.fbcdn.net/image.jpg",
      "https://fbcdn.net.evil.com/image.jpg",
      "http://127.0.0.1",
      "https://user:secret@fbcdn.net/a",
      "https://fbcdn.net:8080/a"
    ])
      expect(instagramMediaUrl(value)).toBeUndefined();
  });
});
