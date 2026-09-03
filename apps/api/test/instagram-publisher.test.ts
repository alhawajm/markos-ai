import type { ContentItem, MediaAsset, Workspace } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { InstagramGraphPublisher, validateInstagramImageForPublishing } from "../src/publishing/instagram-publisher";

describe("InstagramGraphPublisher", () => {
  it("creates, polls, and publishes one JPEG through the constrained Instagram Login transport", async () => {
    const calls: Array<{ authorization?: string; body?: string; method?: string; url: string }> = [];
    const signedUrl = "https://bucket.example.test/object.jpg?signature=sensitive";
    const resolvedObjects: Array<{ publicUrl: string; storageKey: string; workspaceId: string }> = [];
    const fetchImpl = async (input: string | URL, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      const authorization = headers.get("authorization");
      calls.push({
        url: input.toString(),
        ...(authorization === null ? {} : { authorization }),
        ...(init?.body === undefined || init.body === null ? {} : { body: init.body.toString() }),
        ...(init?.method === undefined ? {} : { method: init.method })
      });

      if (calls.length === 1) return jsonResponse({ id: "creation-1" });
      if (calls.length === 2) return jsonResponse({ status_code: "IN_PROGRESS" });
      if (calls.length === 3) return jsonResponse({ status_code: "FINISHED" });
      return jsonResponse({ id: "ig-post-1" });
    };
    const publisher = new InstagramGraphPublisher({
      fetchImpl,
      pollAttempts: 2,
      pollDelayMs: 0,
      providerUrlResolver: async (input) => {
        resolvedObjects.push(input);
        return signedUrl;
      }
    });

    const result = await publisher.publish({
      contentItem: contentItem({ contentType: "POST" }),
      mediaAssets: [
        mediaAsset({
          cdnUrl: "https://api.example.test/media-files/workspace-id/object.jpg",
          s3Key: "s3:workspace-id/object.jpg"
        })
      ],
      workspace: workspace()
    });

    expect(result).toMatchObject({
      dryRun: false,
      instagramPostId: "ig-post-1",
      payload: {
        mediaCount: 1
      },
      status: "PUBLISHED"
    });
    expect(JSON.stringify(result)).not.toContain("signature=sensitive");
    expect(resolvedObjects).toEqual([
      {
        publicUrl: "https://api.example.test/media-files/workspace-id/object.jpg",
        storageKey: "s3:workspace-id/object.jpg",
        workspaceId: "workspace-id"
      }
    ]);
    expect(calls).toHaveLength(4);
    expect(calls[0]).toMatchObject({
      authorization: "Bearer test-token",
      method: "POST",
      url: "https://graph.instagram.com/v25.0/17841400000000000/media"
    });
    expect(calls[0]?.body).toContain("image_url=https%3A%2F%2Fbucket.example.test%2Fobject.jpg%3Fsignature%3Dsensitive");
    expect(calls[0]?.body).toContain("caption=English+caption");
    expect(calls[1]?.url).toBe("https://graph.instagram.com/v25.0/creation-1?fields=status_code");
    expect(calls[2]?.url).toBe("https://graph.instagram.com/v25.0/creation-1?fields=status_code");
    expect(calls[3]).toMatchObject({
      method: "POST",
      url: "https://graph.instagram.com/v25.0/17841400000000000/media_publish"
    });
    expect(calls.every((call) => !call.url.includes("test-token") && !call.body?.includes("test-token"))).toBe(true);
  });

  it("rejects non-JPEG or incomplete image metadata before calling Instagram", async () => {
    let called = false;
    const publisher = new InstagramGraphPublisher({
      fetchImpl: async () => {
        called = true;
        return jsonResponse({ id: "unexpected" });
      }
    });

    await expect(
      publisher.publish({
        contentItem: contentItem({ contentType: "POST" }),
        mediaAssets: [mediaAsset({ filename: "post.svg", height: null, mimeType: "image/jpeg", width: null })],
        workspace: workspace()
      })
    ).rejects.toThrow("INSTAGRAM_PUBLISH_JPEG_REQUIRED");
    expect(called).toBe(false);
  });

  it("keeps the Milestone A live publisher constrained to one image post", async () => {
    const publisher = new InstagramGraphPublisher({
      fetchImpl: async () => jsonResponse({ id: "unexpected" })
    });

    await expect(
      publisher.publish({
        contentItem: contentItem({ contentType: "REEL" }),
        mediaAssets: [mediaAsset({})],
        workspace: workspace()
      })
    ).rejects.toThrow("INSTAGRAM_MILESTONE_A_IMAGE_POST_ONLY");
  });

  it("returns a sanitized code when a container finishes with an error status", async () => {
    const fetchImpl = async (_input: string | URL, init?: RequestInit): Promise<Response> => {
      if (init?.method === "POST") return jsonResponse({ id: "sensitive-container-id" });
      return jsonResponse({ status_code: "ERROR" });
    };
    const publisher = new InstagramGraphPublisher({
      fetchImpl,
      pollAttempts: 1,
      pollDelayMs: 0
    });

    const promise = publisher.publish({
      contentItem: contentItem({ contentType: "POST" }),
      mediaAssets: [mediaAsset({})],
      workspace: workspace()
    });

    await expect(promise).rejects.toThrow("INSTAGRAM_CONTAINER_PROCESSING_FAILED");
    await expect(promise).rejects.not.toThrow("sensitive-container-id");
  });

  it("bounds container polling and requires operator review after a timeout", async () => {
    const publisher = new InstagramGraphPublisher({
      fetchImpl: async (_input, init) => (init?.method === "POST" ? jsonResponse({ id: "creation-1" }) : jsonResponse({ status_code: "IN_PROGRESS" })),
      pollAttempts: 2,
      pollDelayMs: 0
    });

    await expect(
      publisher.publish({
        contentItem: contentItem({ contentType: "POST" }),
        mediaAssets: [mediaAsset({})],
        workspace: workspace()
      })
    ).rejects.toMatchObject({
      code: "INSTAGRAM_CONTAINER_PROCESSING_TIMEOUT",
      retryable: false
    });
  });

  it("reads only live quota fields without guessed fallbacks", async () => {
    const calls: Array<{ authorization?: string; url: string }> = [];
    const fetchImpl = async (input: string | URL, init?: RequestInit): Promise<Response> => {
      const authorization = new Headers(init?.headers).get("authorization");
      calls.push({
        ...(authorization === null ? {} : { authorization }),
        url: input.toString()
      });
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
    const publisher = new InstagramGraphPublisher({ fetchImpl });

    await expect(publisher.getPublishingLimit({ workspace: workspace() })).resolves.toEqual({
      quotaDurationSeconds: 86400,
      quotaTotal: 50,
      quotaUsage: 12
    });
    expect(calls).toEqual([
      {
        authorization: "Bearer test-token",
        url: "https://graph.instagram.com/v25.0/17841400000000000/content_publishing_limit?fields=quota_usage%2Cconfig"
      }
    ]);

    const invalid = new InstagramGraphPublisher({ fetchImpl: async () => jsonResponse({ data: [{ quota_usage: 12 }] }) });
    await expect(invalid.getPublishingLimit({ workspace: workspace() })).rejects.toThrow("INSTAGRAM_PUBLISHING_LIMIT_RESPONSE_INVALID");
  });

  it("redacts provider bodies and tokens from errors", async () => {
    const publisher = new InstagramGraphPublisher({
      fetchImpl: async () =>
        jsonResponse(
          {
            error: {
              code: 190,
              message: "test-token https://bucket.example.test/object.jpg?signature=sensitive",
              type: "OAuthException"
            }
          },
          401
        )
    });

    const promise = publisher.getPublishingLimit({ workspace: workspace() });
    await expect(promise).rejects.toThrow("INSTAGRAM_PROVIDER_HTTP_ERROR");
    await expect(promise).rejects.not.toThrow("test-token");
    await expect(promise).rejects.not.toThrow("signature=sensitive");
  });

  it("times out provider calls with a sanitized error", async () => {
    const publisher = new InstagramGraphPublisher({
      fetchImpl: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("request aborted with test-token")), { once: true });
        }),
      requestTimeoutMs: 1
    });

    await expect(publisher.getPublishingLimit({ workspace: workspace() })).rejects.toThrow("INSTAGRAM_PROVIDER_TIMEOUT");
  });
});

describe("validateInstagramImageForPublishing", () => {
  it("distinguishes explicit JPEG publishing requirements from generic upload metadata", () => {
    expect(validateInstagramImageForPublishing(mediaAsset({}))).toEqual([]);
    expect(
      validateInstagramImageForPublishing(
        mediaAsset({
          cdnUrl: "http://localhost/image.jpg",
          filename: "image.svg",
          height: null,
          mimeType: "image/svg+xml",
          sizeBytes: 0,
          width: null
        })
      )
    ).toEqual([
      "INSTAGRAM_PUBLISH_JPEG_REQUIRED",
      "INSTAGRAM_PUBLISH_IMAGE_DIMENSIONS_REQUIRED",
      "INSTAGRAM_PUBLISH_IMAGE_SIZE_REQUIRED",
      "INSTAGRAM_PUBLISH_PUBLIC_HTTPS_URL_REQUIRED"
    ]);
  });

  it("enforces the Instagram API size, width, and feed aspect-ratio limits", () => {
    expect(
      validateInstagramImageForPublishing(
        mediaAsset({
          height: 2400,
          sizeBytes: 8_000_001,
          width: 1600
        })
      )
    ).toEqual(["INSTAGRAM_PUBLISH_IMAGE_WIDTH_UNSUPPORTED", "INSTAGRAM_PUBLISH_ASPECT_RATIO_UNSUPPORTED", "INSTAGRAM_PUBLISH_IMAGE_TOO_LARGE"]);
    expect(validateInstagramImageForPublishing(mediaAsset({ height: 875, width: 924 }))).toEqual([]);
    expect(validateInstagramImageForPublishing(mediaAsset({ height: 1350, width: 1080 }))).toEqual([]);
    expect(validateInstagramImageForPublishing(mediaAsset({ height: 566, width: 1080 }))).toEqual([]);
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
    onboardingSkippedModules: [],
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
    brief: null,
    callToAction: null,
    campaignActionIndex: null,
    campaignGoal: null,
    campaignId: null,
    campaignWeek: null,
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
    platform: "INSTAGRAM",
    plannedAt: null,
    publishedAt: null,
    reelScript: null,
    scheduledAt: new Date(Date.now() - 1000),
    status: "SCHEDULED",
    tone: null,
    updatedAt: new Date(),
    workspaceId: "workspace-id"
  };
}

function mediaAsset(input: Partial<MediaAsset>): MediaAsset {
  return {
    cdnUrl: "https://cdn.example.com/post.jpg",
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
    workspaceId: "workspace-id",
    ...input
  };
}
