import type { ContentItem, MediaAsset, Workspace } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { MetaGraphInstagramPublisher } from "../src/publishing/instagram-publisher";

describe("MetaGraphInstagramPublisher", () => {
  it("creates, polls, and publishes a single image container", async () => {
    const calls: Array<{ body?: string; method?: string; url: string }> = [];
    const fetchImpl = async (input: string | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        url: input.toString(),
        ...(init?.body === undefined || init.body === null ? {} : { body: init.body.toString() }),
        ...(init?.method === undefined ? {} : { method: init.method })
      });

      if (calls.length === 1) return jsonResponse({ id: "creation-1" });
      if (calls.length === 2) return jsonResponse({ status_code: "FINISHED" });
      return jsonResponse({ id: "ig-post-1" });
    };
    const publisher = new MetaGraphInstagramPublisher({
      fetchImpl,
      graphBaseUrl: "https://graph.test",
      graphVersion: "v24.0",
      pollAttempts: 1,
      pollDelayMs: 0
    });

    const result = await publisher.publish({
      contentItem: contentItem({ contentType: "POST" }),
      mediaAssets: [mediaAsset({ cdnUrl: "https://cdn.example.com/post.jpg" })],
      workspace: workspace()
    });

    expect(result).toMatchObject({
      dryRun: false,
      instagramPostId: "ig-post-1",
      status: "PUBLISHED"
    });
    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://graph.test/v24.0/17841400000000000/media"
    });
    expect(calls[0]?.body).toContain("image_url=https%3A%2F%2Fcdn.example.com%2Fpost.jpg");
    expect(calls[0]?.body).toContain("caption=English+caption");
    expect(calls[1]?.url).toBe("https://graph.test/v24.0/creation-1?fields=status_code&access_token=test-token");
    expect(calls[2]).toMatchObject({
      method: "POST",
      url: "https://graph.test/v24.0/17841400000000000/media_publish"
    });
    expect(calls[2]?.body).toContain("creation_id=creation-1");
  });

  it("creates child containers before publishing a carousel container", async () => {
    const calls: Array<{ body?: string; url: string }> = [];
    const fetchImpl = async (input: string | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        url: input.toString(),
        ...(init?.body === undefined || init.body === null ? {} : { body: init.body.toString() })
      });

      if (calls.length === 1) return jsonResponse({ id: "child-1" });
      if (calls.length === 2) return jsonResponse({ id: "child-2" });
      if (calls.length === 3) return jsonResponse({ id: "carousel-1" });
      if (calls.length === 4) return jsonResponse({ status_code: "FINISHED" });
      return jsonResponse({ id: "ig-carousel-1" });
    };
    const publisher = new MetaGraphInstagramPublisher({
      fetchImpl,
      graphBaseUrl: "https://graph.test",
      graphVersion: "v24.0",
      pollAttempts: 1,
      pollDelayMs: 0
    });

    const result = await publisher.publish({
      contentItem: contentItem({ contentType: "CAROUSEL" }),
      mediaAssets: [
        mediaAsset({ cdnUrl: "https://cdn.example.com/one.jpg" }),
        mediaAsset({ cdnUrl: "https://cdn.example.com/two.jpg" })
      ],
      workspace: workspace()
    });

    expect(result.instagramPostId).toBe("ig-carousel-1");
    expect(calls).toHaveLength(5);
    expect(calls[0]?.body).toContain("is_carousel_item=true");
    expect(calls[1]?.body).toContain("is_carousel_item=true");
    expect(calls[2]?.body).toContain("media_type=CAROUSEL");
    expect(calls[2]?.body).toContain("children=child-1%2Cchild-2");
  });

  it("throws when a container finishes with an error status", async () => {
    const fetchImpl = async (_input: string | URL, _init?: RequestInit): Promise<Response> => {
      if (_init?.method === "POST") return jsonResponse({ id: "creation-1" });
      return jsonResponse({ status_code: "ERROR" });
    };
    const publisher = new MetaGraphInstagramPublisher({
      fetchImpl,
      graphBaseUrl: "https://graph.test",
      graphVersion: "v24.0",
      pollAttempts: 1,
      pollDelayMs: 0
    });

    await expect(
      publisher.publish({
        contentItem: contentItem({ contentType: "POST" }),
        mediaAssets: [mediaAsset({ cdnUrl: "https://cdn.example.com/post.jpg" })],
        workspace: workspace()
      })
    ).rejects.toThrow("Instagram media container creation-1 is ERROR");
  });

  it("reads the current content publishing limit", async () => {
    const calls: string[] = [];
    const fetchImpl = async (input: string | URL, _init?: RequestInit): Promise<Response> => {
      calls.push(input.toString());
      return jsonResponse({
        data: [
          {
            config: {
              quota_duration: 86400,
              quota_total: 50
            },
            quota_usage: 12
          }
        ]
      });
    };
    const publisher = new MetaGraphInstagramPublisher({
      fetchImpl,
      graphBaseUrl: "https://graph.test",
      graphVersion: "v24.0"
    });

    const limit = await publisher.getPublishingLimit({ workspace: workspace() });

    expect(limit).toEqual({
      quotaDurationSeconds: 86400,
      quotaTotal: 50,
      quotaUsage: 12
    });
    expect(calls).toEqual([
      "https://graph.test/v24.0/17841400000000000/content_publishing_limit?fields=quota_usage%2Cconfig&access_token=test-token"
    ]);
  });
});

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status
  });
}

function workspace(): Workspace {
  return {
    createdAt: new Date(),
    deletedAt: null,
    id: "workspace-id",
    instagramAccessToken: "test-token",
    instagramAccountId: "17841400000000000",
    instagramTokenExpiresAt: new Date(Date.now() + 3600000),
    name: "Workspace",
    onboardingScore: 0,
    onboardingStatus: "NOT_STARTED",
    ownerUserId: "owner-id",
    slug: "workspace",
    updatedAt: new Date(),
    vatPricingMode: "EXCLUSIVE"
  };
}

function contentItem(input: { contentType: "CAROUSEL" | "POST" | "REEL" }): ContentItem {
  return {
    aiPromptUsed: null,
    callToAction: null,
    campaignId: null,
    captionAr: null,
    captionEn: "English caption",
    carousel: null,
    contentPillar: null,
    contentType: input.contentType,
    createdAt: new Date(),
    deletedAt: null,
    failureReason: null,
    hashtags: ["#Bahrain"],
    id: "content-id",
    instagramPostId: null,
    mediaIds: ["media-id"],
    publishedAt: null,
    reelScript: null,
    scheduledAt: new Date(Date.now() - 1000),
    status: "SCHEDULED",
    updatedAt: new Date(),
    workspaceId: "workspace-id"
  };
}

function mediaAsset(input: { cdnUrl: string }): MediaAsset {
  return {
    cdnUrl: input.cdnUrl,
    createdAt: new Date(),
    deletedAt: null,
    durationSeconds: null,
    filename: "post.jpg",
    height: 1080,
    id: "media-id",
    mimeType: "image/jpeg",
    s3Key: "external:test",
    sizeBytes: 120000,
    type: "IMAGE",
    updatedAt: new Date(),
    width: 1080,
    workspaceId: "workspace-id"
  };
}
