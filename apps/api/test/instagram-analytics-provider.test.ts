import type { ContentItem, Workspace } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { InstagramGraphAnalyticsProvider, normalizeInsights } from "../src/analytics/instagram-analytics-provider";

const period = { from: new Date("2026-01-01T00:00:00Z"), to: new Date("2026-01-07T00:00:00Z") };
const insight = (name: string, value: number) => ({ name, values: [{ value }] });

describe("InstagramGraphAnalyticsProvider", () => {
  it("discovers paginated media, keeps lifetime metrics separate, and matches published media IDs", async () => {
    const calls: URL[] = [];
    const provider = new InstagramGraphAnalyticsProvider({
      fetchImpl: async (input, init) => {
        const url = new URL(input);
        calls.push(url);
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer live-token");
        expect(url.origin).toBe("https://graph.instagram.com");
        expect(url.pathname).toContain("/v25.0/");
        if (url.pathname.endsWith("/media"))
          return jsonResponse(
            url.searchParams.has("after")
              ? { data: [{ id: "external-reel", media_type: "VIDEO", media_product_type: "REELS", timestamp: "2026-01-04T00:00:00Z" }] }
              : {
                  data: [{ id: "ig-media-id", media_type: "CAROUSEL_ALBUM", media_product_type: "FEED", timestamp: "2026-01-05T00:00:00Z" }],
                  paging: { next: "https://untrusted.invalid/?access_token=DO_NOT_FOLLOW", cursors: { after: "page-two" } }
                }
          );
        if (url.pathname.endsWith("/stories")) return jsonResponse({ data: [{ id: "story", media_product_type: "STORY", timestamp: "2026-01-07T00:00:00Z" }] });
        if (!url.pathname.endsWith("/insights")) return jsonResponse({ followers_count: 1 });
        if (url.searchParams.get("metric_type") === "time_series")
          return jsonResponse({
            data: [
              {
                name: "reach",
                values: [
                  { value: 4, end_time: "2026-01-02T08:00:00Z" },
                  { value: 0, end_time: "2026-01-03T08:00:00Z" }
                ]
              }
            ]
          });
        return jsonResponse({
          data: url.searchParams
            .get("metric")!
            .split(",")
            .map((metric) => insight(metric, metric === "reach" ? 12 : 0))
        });
      }
    });
    const result = await provider.syncWorkspace({ ...period, workspace: workspace(), contentItems: [contentItem()] });
    expect(result.diagnostics).toMatchObject({ status: "COMPLETE", discovered: 3, synced: 3, linked: 1, warnings: [] });
    expect(result.snapshots.find((s) => s.contentItemId)?.metrics).toMatchObject({
      instagramMediaId: "ig-media-id",
      _scope: "media_lifetime",
      reach: 12,
      shares: 0
    });
    expect(result.snapshots.filter((s) => s.metrics._scope === "account_day").map((s) => [s.dataDate.toISOString(), s.metrics.reach])).toEqual([
      ["2026-01-01T00:00:00.000Z", 4],
      ["2026-01-02T00:00:00.000Z", 0]
    ]);
    const account = calls.find((url) => url.searchParams.get("metric_type") === "total_value")!;
    expect(account.searchParams.get("since")).toBe(String(period.from.getTime() / 1000));
    expect(account.searchParams.get("until")).toBe(String((period.to.getTime() + 86400000) / 1000));
    expect(calls.find((url) => url.pathname.endsWith("/story/insights"))?.searchParams.get("metric")).toBe("reach,views,shares,replies,total_interactions");
    expect(calls.find((url) => url.pathname.endsWith("/external-reel/insights"))?.searchParams.has("since")).toBe(false);
    expect(calls.every((url) => !url.toString().includes("live-token"))).toBe(true);
  });

  it("preserves supported metrics and measured zero when another metric is unsupported", async () => {
    const provider = new InstagramGraphAnalyticsProvider({
      fetchImpl: async (input) => {
        const url = new URL(input);
        const metric = url.searchParams.get("metric");
        if (!metric) return jsonResponse(url.pathname.endsWith("/media") || url.pathname.endsWith("/stories") ? { data: [] } : { followers_count: 0 });
        if (metric.includes("profile_views")) return jsonResponse({ error: { code: 100, message: "unsupported" } }, 400);
        if (url.searchParams.get("metric_type") === "time_series") return jsonResponse({ data: [] });
        return jsonResponse({
          data: metric
            .split(",")
            .filter((m) => m !== "views")
            .map((m) => insight(m, 0))
        });
      }
    });
    const result = await provider.syncWorkspace({ ...period, workspace: workspace(), contentItems: [] });
    expect(result.diagnostics.status).toBe("PARTIAL");
    expect(result.snapshots[0]?.metrics).toMatchObject({ reach: 0, likes: 0 });
    expect(result.snapshots[0]?.metrics.views).toBeUndefined();
    expect(result.snapshots[0]?.metrics.profileViews).toBeUndefined();
    expect(result.diagnostics.warnings).toContainEqual({ stage: "account", code: "INSTAGRAM_PROVIDER_HTTP_ERROR", metric: "profile_views", providerCode: 100 });
  });

  it("flags incomplete discovery and retains account results instead of reporting full success", async () => {
    const provider = new InstagramGraphAnalyticsProvider({
      fetchImpl: async (input) => {
        const url = new URL(input);
        if (url.pathname.endsWith("/media")) return jsonResponse({ error: { code: 2 } }, 503);
        if (url.pathname.endsWith("/stories")) return jsonResponse({ data: [] });
        if (!url.searchParams.has("metric")) return jsonResponse({ followers_count: 1 });
        return jsonResponse({ data: [insight("reach", 5)] });
      }
    });
    const result = await provider.syncWorkspace({ ...period, workspace: workspace(), contentItems: [] });
    expect(result.diagnostics.status).toBe("PARTIAL");
    expect(result.snapshots[0]?.metrics.reach).toBe(5);
    expect(result.diagnostics.warnings).toContainEqual({ stage: "discovery", code: "INSTAGRAM_PROVIDER_HTTP_ERROR", providerCode: 2 });
  });

  it("accepts total_value responses while ignoring malformed and unavailable metrics", () => {
    expect(
      normalizeInsights([
        { name: "reach", values: [{ value: 14 }, { value: 15 }] },
        { name: "comments", total_value: { value: 0 } },
        { name: "profile_views", values: [] },
        { name: "shares", values: [{ value: "not-a-number" }] },
        { values: [{ value: 4 }] }
      ])
    ).toEqual({ comments: 0, reach: 15 });
  });

  it("reports total failure with sanitized diagnostics", async () => {
    const provider = new InstagramGraphAnalyticsProvider({
      fetchImpl: async () => jsonResponse({ error: { code: 190, message: "live-token private provider details" } }, 401)
    });
    const result = await provider.syncWorkspace({ ...period, workspace: workspace(), contentItems: [] });
    expect(result.diagnostics.status).toBe("FAILED");
    expect(JSON.stringify(result)).not.toContain("live-token");
    expect(result.diagnostics.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "INSTAGRAM_PROVIDER_HTTP_ERROR", providerCode: 190 })])
    );
  });

  it("bounds provider requests with a timeout", async () => {
    const provider = new InstagramGraphAnalyticsProvider({
      requestTimeoutMs: 1,
      fetchImpl: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted with live-token")), { once: true });
        })
    });
    const result = await provider.syncWorkspace({ ...period, workspace: workspace(), contentItems: [] });
    expect(result.diagnostics.status).toBe("FAILED");
    expect(result.diagnostics.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "INSTAGRAM_PROVIDER_TIMEOUT" })]));
    expect(JSON.stringify(result)).not.toContain("live-token");
  });
});

function workspace(): Workspace {
  return {
    createdAt: new Date(),
    deletedAt: null,
    id: "workspace-id",
    instagramAccessToken: "live-token",
    instagramAccountId: "17841400000000000",
    instagramTokenExpiresAt: new Date(Date.UTC(2026, 1, 1)),
    name: "Workspace",
    onboardingScore: 0,
    onboardingSkippedModules: [],
    onboardingStatus: "NOT_STARTED",
    ownerUserId: "owner-id",
    slug: "workspace",
    updatedAt: new Date(),
    vatPricingMode: "EXCLUSIVE"
  };
}

function contentItem(): ContentItem {
  return {
    aiPromptUsed: null,
    revision: 1,

    brief: null,
    caption: "Analytics post\n\n#MarkosAI",
    campaignActionIndex: null,
    campaignGoal: null,
    campaignId: null,
    campaignWeek: null,

    contentPillar: null,
    contentType: "POST",
    createdAt: new Date(),
    deletedAt: null,
    failureReason: null,
    id: "content-id",
    instagramPostId: "ig-media-id",

    platform: "INSTAGRAM",
    plannedAt: null,
    publishedAt: new Date(Date.UTC(2026, 0, 5)),

    scheduledAt: null,
    status: "PUBLISHED",
    tone: null,
    updatedAt: new Date(),
    workspaceId: "workspace-id"
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status
  });
}
