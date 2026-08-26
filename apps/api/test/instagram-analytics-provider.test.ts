import type { ContentItem, Workspace } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { InstagramGraphAnalyticsProvider, normalizeInsights } from "../src/analytics/instagram-analytics-provider";

describe("InstagramGraphAnalyticsProvider", () => {
  it("uses separate account and media insight calls through the constrained Instagram Login transport", async () => {
    const content = contentItem();
    const calls: Array<{ authorization?: string; url: string }> = [];
    const provider = new InstagramGraphAnalyticsProvider({
      fetchImpl: async (input, init) => {
        const url = input.toString();
        const authorization = new Headers(init?.headers).get("authorization");
        calls.push({
          ...(authorization === null ? {} : { authorization }),
          url
        });

        if (url.includes("/17841400000000000/insights?")) {
          return jsonResponse({
            data: [
              { name: "reach", values: [{ value: 321 }] },
              { name: "profile_views", values: [{ value: 0 }] }
            ]
          });
        }

        if (url.includes(`/${content.instagramPostId}/insights?`)) {
          return jsonResponse({
            data: [
              { name: "comments", values: [{ value: 3 }] },
              { name: "shares", values: [{ value: 0 }] }
            ]
          });
        }

        return jsonResponse({ error: { code: 100, message: "Unexpected URL" } }, 404);
      }
    });

    const snapshots = await provider.syncWorkspace({
      contentItems: [content],
      from: new Date(Date.UTC(2026, 0, 1)),
      to: new Date(Date.UTC(2026, 0, 31)),
      workspace: workspace()
    });

    expect(snapshots).toEqual([
      {
        dataDate: new Date(Date.UTC(2026, 0, 31)),
        metricType: "ACCOUNT",
        metrics: {
          profileViews: 0,
          reach: 321
        }
      },
      {
        contentItemId: content.id,
        dataDate: new Date(Date.UTC(2026, 0, 5)),
        metricType: "POST",
        metrics: {
          comments: 3,
          shares: 0
        }
      }
    ]);
    expect(calls).toEqual([
      {
        authorization: "Bearer live-token",
        url: "https://graph.instagram.com/v25.0/17841400000000000/insights?metric=reach%2Cprofile_views&period=day"
      },
      {
        authorization: "Bearer live-token",
        url: `https://graph.instagram.com/v25.0/${content.instagramPostId}/insights?metric=shares%2Ccomments`
      }
    ]);
    expect(calls.every((call) => !call.url.includes("live-token"))).toBe(true);
  });

  it("preserves an empty provider dataset separately from an explicit zero", async () => {
    let request = 0;
    const provider = new InstagramGraphAnalyticsProvider({
      fetchImpl: async () => {
        request += 1;
        return request === 1 ? jsonResponse({ data: [] }) : jsonResponse({ data: [{ name: "shares", values: [{ value: 0 }] }] });
      }
    });

    const snapshots = await provider.syncWorkspace({
      contentItems: [contentItem()],
      from: new Date(Date.UTC(2026, 0, 1)),
      to: new Date(Date.UTC(2026, 0, 31)),
      workspace: workspace()
    });

    expect(snapshots[0]?.metrics).toEqual({});
    expect(snapshots[1]?.metrics).toEqual({ shares: 0 });
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

  it("returns only a sanitized provider error code", async () => {
    const provider = new InstagramGraphAnalyticsProvider({
      fetchImpl: async () =>
        jsonResponse(
          {
            error: {
              code: 190,
              message: "live-token private provider details",
              type: "OAuthException"
            }
          },
          401
        )
    });

    const promise = provider.syncWorkspace({
      contentItems: [],
      from: new Date(Date.UTC(2026, 0, 1)),
      to: new Date(Date.UTC(2026, 0, 31)),
      workspace: workspace()
    });

    await expect(promise).rejects.toThrow("INSTAGRAM_PROVIDER_HTTP_ERROR");
    await expect(promise).rejects.not.toThrow("live-token");
  });

  it("bounds provider requests with a timeout", async () => {
    const provider = new InstagramGraphAnalyticsProvider({
      fetchImpl: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted with live-token")), { once: true });
        }),
      requestTimeoutMs: 1
    });

    await expect(
      provider.syncWorkspace({
        contentItems: [],
        from: new Date(Date.UTC(2026, 0, 1)),
        to: new Date(Date.UTC(2026, 0, 31)),
        workspace: workspace()
      })
    ).rejects.toThrow("INSTAGRAM_PROVIDER_TIMEOUT");
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
    callToAction: null,
    campaignId: null,
    captionAr: null,
    captionEn: "Analytics post",
    carousel: null,
    contentPillar: null,
    contentType: "POST",
    createdAt: new Date(),
    deletedAt: null,
    failureReason: null,
    hashtags: ["#MarkosAI"],
    id: "content-id",
    instagramPostId: "ig-media-id",
    mediaIds: [],
    plannedAt: null,
    publishedAt: new Date(Date.UTC(2026, 0, 5)),
    reelScript: null,
    scheduledAt: null,
    status: "PUBLISHED",
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
