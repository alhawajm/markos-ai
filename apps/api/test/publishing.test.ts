import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { env } from "../src/config/env";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { persistTestInstagramConnection } from "./helpers/instagram-connection";
import { InstagramGraphPublisher, InstagramPublishError, type InstagramPublisher } from "../src/publishing/instagram-publisher";
import { publishContentItem } from "../src/publishing/publishing-service";

describe("publishing routes", () => {
  it("reports live publishing readiness blockers before Instagram Login is configured", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    const response = await app.inject({
      method: "GET",
      url: "/v1/publishing/live-readiness",
      headers
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        mode: "dry_run",
        ready: false,
        reasons: expect.arrayContaining(["INSTAGRAM_PUBLISH_MODE_NOT_LIVE", "INSTAGRAM_NOT_CONNECTED"]),
        requiredEnv: [
          "INSTAGRAM_PUBLISH_MODE",
          "INSTAGRAM_APP_ID",
          "INSTAGRAM_APP_SECRET",
          "INSTAGRAM_OAUTH_REDIRECT_URI",
          "INSTAGRAM_OAUTH_STATE_SECRET",
          "INSTAGRAM_TOKEN_ENCRYPTION_KEY",
          "INSTAGRAM_GRAPH_VERSION",
          "INSTAGRAM_OAUTH_SCOPES",
          "MEDIA_STORAGE_DRIVER",
          "AWS_ENDPOINT_URL",
          "AWS_ACCESS_KEY_ID",
          "AWS_SECRET_ACCESS_KEY",
          "AWS_S3_BUCKET_NAME",
          "AWS_DEFAULT_REGION",
          "AWS_S3_URL_STYLE",
          "SIGNED_URL_TTL"
        ],
        requiredScopes: ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"],
        graphVersion: "v25.0"
      }
    });

    await app.close();
  });

  it("reports live publishing ready when live mode, Instagram Login, and the expanded connection are configured", async () => {
    const previousMode = env.INSTAGRAM_PUBLISH_MODE;
    const previousStorageDriver = env.MEDIA_STORAGE_DRIVER;
    const previousProcessEnv = {
      INSTAGRAM_PUBLISH_MODE: process.env.INSTAGRAM_PUBLISH_MODE,
      INSTAGRAM_APP_ID: process.env.INSTAGRAM_APP_ID,
      INSTAGRAM_APP_SECRET: process.env.INSTAGRAM_APP_SECRET,
      INSTAGRAM_OAUTH_REDIRECT_URI: process.env.INSTAGRAM_OAUTH_REDIRECT_URI,
      INSTAGRAM_OAUTH_STATE_SECRET: process.env.INSTAGRAM_OAUTH_STATE_SECRET,
      INSTAGRAM_TOKEN_ENCRYPTION_KEY: process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY,
      INSTAGRAM_GRAPH_VERSION: process.env.INSTAGRAM_GRAPH_VERSION,
      INSTAGRAM_OAUTH_SCOPES: process.env.INSTAGRAM_OAUTH_SCOPES,
      MEDIA_STORAGE_DRIVER: process.env.MEDIA_STORAGE_DRIVER,
      AWS_ENDPOINT_URL: process.env.AWS_ENDPOINT_URL,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME,
      AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION,
      AWS_S3_URL_STYLE: process.env.AWS_S3_URL_STYLE,
      SIGNED_URL_TTL: process.env.SIGNED_URL_TTL
    };
    env.INSTAGRAM_PUBLISH_MODE = "live";
    env.MEDIA_STORAGE_DRIVER = "s3";
    process.env.INSTAGRAM_PUBLISH_MODE = "live";
    process.env.INSTAGRAM_APP_ID = "123456789";
    process.env.INSTAGRAM_APP_SECRET = "test-secret";
    process.env.INSTAGRAM_OAUTH_REDIRECT_URI = "https://app.example.com/v1/workspace/instagram/oauth/callback";
    process.env.INSTAGRAM_OAUTH_STATE_SECRET = "test-state-secret-that-is-at-least-thirty-two-bytes";
    process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    process.env.INSTAGRAM_GRAPH_VERSION = "v25.0";
    process.env.INSTAGRAM_OAUTH_SCOPES = "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights";
    process.env.MEDIA_STORAGE_DRIVER = "s3";
    process.env.AWS_ENDPOINT_URL = "https://storage.railway.app";
    process.env.AWS_ACCESS_KEY_ID = "fake-access-key";
    process.env.AWS_SECRET_ACCESS_KEY = "fake-secret-key";
    process.env.AWS_S3_BUCKET_NAME = "markos-staging";
    process.env.AWS_DEFAULT_REGION = "auto";
    process.env.AWS_S3_URL_STYLE = "virtual";
    process.env.SIGNED_URL_TTL = "3600";

    const app = await buildApp();

    try {
      const session = await registerTestUser(app);
      const headers = authHeaders(session.tokens.accessToken);
      await persistTestInstagramConnection({ workspaceId: session.workspace.id, actorId: session.user.id });

      const response = await app.inject({
        method: "GET",
        url: "/v1/publishing/live-readiness",
        headers
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        data: {
          connection: {
            accountId: expect.any(String),
            connected: true
          },
          mode: "live",
          ready: true,
          reasons: []
        }
      });
    } finally {
      await app.close();
      env.INSTAGRAM_PUBLISH_MODE = previousMode;
      env.MEDIA_STORAGE_DRIVER = previousStorageDriver;
      restoreProcessEnv(previousProcessEnv);
    }
  });

  it("lists scheduled and failed content in the publishing queue", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const scheduled = await createPublishableFutureContent(session.workspace.id);
    const failed = await createPublishableContent(session.workspace.id, new Date(Date.now() - 60 * 1000));
    await prisma.contentItem.update({
      data: {
        failureReason: "Meta rejected the media container",
        status: "FAILED"
      },
      where: {
        id: failed.content.id
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/publishing/queue",
      headers
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: scheduled.content.id,
          status: "SCHEDULED"
        }),
        expect.objectContaining({
          failureReason: "Meta rejected the media container",
          id: failed.content.id,
          status: "FAILED"
        })
      ])
    );

    await app.close();
  });

  it("reschedules a failed publishing item and clears the failure reason", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const failed = await createPublishableContent(session.workspace.id, new Date(Date.now() - 60 * 1000));
    const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    await prisma.contentItem.update({
      data: {
        failureReason: "Meta rejected the media container",
        status: "FAILED"
      },
      where: {
        id: failed.content.id
      }
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/publishing/content/${failed.content.id}/reschedule`,
      headers,
      payload: {
        scheduledAt
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        id: failed.content.id,
        scheduledAt,
        status: "SCHEDULED"
      }
    });
    expect(response.json().data.failureReason).toBeUndefined();

    await app.close();
  });

  it("rejects publishing reschedule for non-failed content", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const scheduled = await createPublishableFutureContent(session.workspace.id);

    const response = await app.inject({
      method: "POST",
      url: `/v1/publishing/content/${scheduled.content.id}/reschedule`,
      headers,
      payload: {
        scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("PUBLISH_RESCHEDULE_INVALID");

    await app.close();
  });

  it("blocks dry-run publishing when prerequisites are missing", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const content = await prisma.contentItem.create({
      data: {
        workspaceId: session.workspace.id,
        contentType: "POST",
        status: "SCHEDULED",
        captionEn: "No media yet",
        hashtags: ["#Bahrain"],
        mediaIds: [],
        scheduledAt: new Date(Date.now() - 60 * 1000)
      }
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/publishing/content/${content.id}/dry-run`,
      headers
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        contentItemId: content.id,
        dryRun: true,
        reasons: ["INSTAGRAM_NOT_CONNECTED", "PUBLIC_MEDIA_REQUIRED"],
        status: "BLOCKED"
      }
    });

    await app.close();
  });

  it("builds a dry-run Instagram payload for due scheduled content", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const { content } = await createPublishableDueContent(session.workspace.id);

    await persistTestInstagramConnection({ workspaceId: session.workspace.id, actorId: session.user.id });

    const response = await app.inject({
      method: "POST",
      url: `/v1/publishing/content/${content.id}/dry-run`,
      headers
    });
    const after = await prisma.contentItem.findUniqueOrThrow({
      where: {
        id: content.id
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        contentItemId: content.id,
        dryRun: true,
        reasons: [],
        result: {
          dryRun: true,
          payload: {
            accountId: expect.any(String),
            caption: "Ready to publish\n\n#Bahrain #MarkosAI",
            contentItemId: content.id,
            contentType: "POST",
            mediaCount: 1
          },
          status: "DRY_RUN"
        },
        status: "DRY_RUN"
      }
    });
    expect(after.status).toBe("SCHEDULED");
    expect(after.instagramPostId).toBeNull();
    expect(after.publishedAt).toBeNull();

    await app.close();
  });

  it("exposes the temporary item-specific operator path only after MFA step-up", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const { content } = await createPublishableDueContent(session.workspace.id);
    await persistTestInstagramConnection({ workspaceId: session.workspace.id, actorId: session.user.id });

    const withoutStepUp = await app.inject({
      method: "POST",
      url: `/v1/publishing/content/${content.id}/publish`,
      headers: authHeaders(session.tokens.accessToken)
    });
    const withStepUp = await app.inject({
      method: "POST",
      url: `/v1/publishing/content/${content.id}/publish`,
      headers: authHeaders(await steppedUpToken(session.user.id, session.workspace.id))
    });

    expect(withoutStepUp.statusCode).toBe(403);
    expect(withStepUp.statusCode).toBe(200);
    expect(withStepUp.json()).toMatchObject({
      data: {
        contentItemId: content.id,
        dryRun: true,
        reasons: [],
        result: {
          payload: {
            mediaCount: 1
          },
          status: "DRY_RUN"
        },
        status: "DRY_RUN"
      }
    });

    await app.close();
  });

  it("blocks a live provider call until the account is reconnected for the release scopes", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const { content } = await createPublishableDueContent(session.workspace.id);
    await persistTestInstagramConnection({ workspaceId: session.workspace.id, actorId: session.user.id });
    await prisma.instagramConnectionCredential.update({
      data: {
        requestedScopes: ["instagram_business_basic"]
      },
      where: {
        workspaceId: session.workspace.id
      }
    });
    let providerCalled = false;
    const publisher = new InstagramGraphPublisher({
      fetchImpl: async () => {
        providerCalled = true;
        return new Response(JSON.stringify({ id: "unexpected" }), { status: 200 });
      }
    });

    const result = await publishContentItem(session.workspace.id, content.id, { publisher });

    expect(result).toMatchObject({
      contentItemId: content.id,
      reasons: ["INSTAGRAM_RECONNECT_REQUIRED_FOR_RELEASE_SCOPES"],
      status: "BLOCKED"
    });
    expect(providerCalled).toBe(false);

    await app.close();
  });

  it("mints the S3 provider URL just in time without persisting or returning it", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const { content, media } = await createPublishableDueContent(session.workspace.id);
    await persistTestInstagramConnection({ workspaceId: session.workspace.id, actorId: session.user.id, accessToken: "test-token" });
    const signedUrl = "https://markos-bucket.storage.railway.app/object.jpg?X-Amz-Signature=sensitive";
    const calls: Array<{ body?: string; url: string }> = [];
    const publisher = new InstagramGraphPublisher({
      fetchImpl: async (input, init) => {
        calls.push({
          url: input.toString(),
          ...(init?.body === undefined || init.body === null ? {} : { body: init.body.toString() })
        });

        if (input.toString().includes("content_publishing_limit")) {
          return new Response(JSON.stringify({ data: [{ config: { quota_duration: 86400, quota_total: 50 }, quota_usage: 0 }] }));
        }
        if (input.toString().endsWith("/media")) return new Response(JSON.stringify({ id: "container-1" }));
        if (input.toString().includes("/container-1?")) return new Response(JSON.stringify({ status_code: "FINISHED" }));
        return new Response(JSON.stringify({ id: "published-1" }));
      },
      pollDelayMs: 0,
      providerUrlResolver: async (input) => {
        expect(input).toEqual({
          publicUrl: media.cdnUrl,
          storageKey: media.s3Key,
          workspaceId: session.workspace.id
        });
        return signedUrl;
      }
    });

    const result = await publishContentItem(session.workspace.id, content.id, { publisher });
    const persistedMedia = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: media.id } });

    expect(result.status).toBe("PUBLISHED");
    expect(JSON.stringify(result)).not.toContain("X-Amz-Signature");
    expect(calls.find((call) => call.url.endsWith("/media"))?.body).toContain(encodeURIComponent(signedUrl));
    expect(persistedMedia.cdnUrl).toBe("https://cdn.example.com/publish.jpg");
    expect(persistedMedia.cdnUrl).not.toContain("X-Amz-Signature");

    await app.close();
  });

  it("runs due publishing only for due content in the active workspace", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const due = await createPublishableDueContent(session.workspace.id);
    await createPublishableFutureContent(session.workspace.id);
    await persistTestInstagramConnection({ workspaceId: session.workspace.id, actorId: session.user.id });

    const response = await app.inject({
      method: "POST",
      url: "/v1/publishing/run-due",
      headers
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        attempted: 1,
        attempts: [
          {
            contentItemId: due.content.id,
            status: "DRY_RUN"
          }
        ]
      }
    });

    await app.close();
  });

  it("marks content failed when the live publisher fails", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const { content } = await createPublishableDueContent(session.workspace.id);
    await persistTestInstagramConnection({ workspaceId: session.workspace.id, actorId: session.user.id, accessToken: "test-token" });
    const publisher: InstagramPublisher = {
      async publish() {
        throw new InstagramPublishError("INSTAGRAM_CONTAINER_PROCESSING_FAILED");
      }
    };

    const attempt = await publishContentItem(session.workspace.id, content.id, { publisher });
    const failed = await prisma.contentItem.findUniqueOrThrow({
      where: {
        id: content.id
      }
    });

    expect(attempt).toMatchObject({
      contentItemId: content.id,
      dryRun: false,
      reasons: ["INSTAGRAM_CONTAINER_PROCESSING_FAILED"],
      status: "FAILED"
    });
    expect(failed.status).toBe("FAILED");
    expect(failed.failureReason).toBe("INSTAGRAM_CONTAINER_PROCESSING_FAILED");

    await app.close();
  });

  it("meters successful live publishes against the MARKOS post quota", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const { content } = await createPublishableDueContent(session.workspace.id);

    await persistTestInstagramConnection({ workspaceId: session.workspace.id, actorId: session.user.id, accessToken: "test-token" });

    const publisher: InstagramPublisher = {
      async getPublishingLimit() {
        return {
          quotaDurationSeconds: 86400,
          quotaTotal: 50,
          quotaUsage: 12
        };
      },
      async publish() {
        return {
          dryRun: false,
          instagramPostId: "ig-post-1",
          payload: {
            accountId: expect.any(String),
            caption: "Ready to publish\n\n#Bahrain #MarkosAI",
            contentItemId: content.id,
            contentType: "POST",
            mediaCount: 1
          },
          status: "PUBLISHED"
        };
      }
    };

    const attempt = await publishContentItem(session.workspace.id, content.id, { publisher });
    const counter = await prisma.usageCounter.findUniqueOrThrow({
      where: {
        workspaceId_metric_periodStart: {
          workspaceId: session.workspace.id,
          metric: "POST_PUBLISH",
          periodStart: monthStart()
        }
      }
    });

    expect(attempt.status).toBe("PUBLISHED");
    expect(counter).toMatchObject({
      limit: 30,
      used: 1
    });

    await app.close();
  });

  it("blocks a duplicate in-process manual publish while the first attempt is active", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const { content } = await createPublishableDueContent(session.workspace.id);
    await persistTestInstagramConnection({ workspaceId: session.workspace.id, actorId: session.user.id, accessToken: "test-token" });

    let releasePublish: (() => void) | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releasePublish = resolve;
    });
    const publisher: InstagramPublisher = {
      async publish() {
        markStarted?.();
        await release;
        return {
          dryRun: false,
          instagramPostId: "single-published-id",
          payload: {
            accountId: "test-account",
            caption: "Ready to publish",
            contentItemId: content.id,
            contentType: "POST",
            mediaCount: 1
          },
          status: "PUBLISHED"
        };
      }
    };

    const first = publishContentItem(session.workspace.id, content.id, { publisher });
    await started;
    const duplicate = await publishContentItem(session.workspace.id, content.id, { publisher });
    releasePublish?.();
    const completed = await first;

    expect(duplicate).toMatchObject({
      contentItemId: content.id,
      reasons: ["INSTAGRAM_PUBLISH_ALREADY_IN_PROGRESS"],
      status: "BLOCKED"
    });
    expect(completed.status).toBe("PUBLISHED");

    await app.close();
  });

  it("blocks live publishing when the MARKOS post quota is exhausted", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const { content } = await createPublishableDueContent(session.workspace.id);

    await persistTestInstagramConnection({ workspaceId: session.workspace.id, actorId: session.user.id, accessToken: "test-token" });
    await prisma.usageCounter.create({
      data: {
        workspaceId: session.workspace.id,
        metric: "POST_PUBLISH",
        periodStart: monthStart(),
        periodEnd: nextMonthStart(),
        used: 30,
        limit: 30
      }
    });

    const publisher: InstagramPublisher = {
      async getPublishingLimit() {
        return {
          quotaDurationSeconds: 86400,
          quotaTotal: 50,
          quotaUsage: 12
        };
      },
      async publish() {
        throw new Error("publish should not be called when the MARKOS post quota is exhausted");
      }
    };

    const attempt = await publishContentItem(session.workspace.id, content.id, { publisher });
    const after = await prisma.contentItem.findUniqueOrThrow({
      where: {
        id: content.id
      }
    });

    expect(attempt).toMatchObject({
      contentItemId: content.id,
      dryRun: false,
      reasons: ["POST_PUBLISH_QUOTA_EXCEEDED"],
      status: "BLOCKED"
    });
    expect(after.status).toBe("SCHEDULED");
    expect(after.publishedAt).toBeNull();

    await app.close();
  });

  it("blocks live publishing when billing is past due", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const { content } = await createPublishableDueContent(session.workspace.id);

    await prisma.user.update({
      data: {
        planStatus: "PAST_DUE"
      },
      where: {
        id: session.user.id
      }
    });
    await persistTestInstagramConnection({ workspaceId: session.workspace.id, actorId: session.user.id, accessToken: "test-token" });

    const publisher: InstagramPublisher = {
      async getPublishingLimit() {
        return {
          quotaDurationSeconds: 86400,
          quotaTotal: 50,
          quotaUsage: 12
        };
      },
      async publish() {
        throw new Error("publish should not be called when billing is past due");
      }
    };

    const attempt = await publishContentItem(session.workspace.id, content.id, { publisher });
    const after = await prisma.contentItem.findUniqueOrThrow({
      where: {
        id: content.id
      }
    });

    expect(attempt).toMatchObject({
      contentItemId: content.id,
      dryRun: false,
      reasons: ["BILLING_STATUS_PAST_DUE"],
      status: "BLOCKED"
    });
    expect(after.status).toBe("SCHEDULED");
    expect(after.publishedAt).toBeNull();

    await app.close();
  });

  it("blocks publishing before container creation when the daily Instagram limit is reached", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const { content } = await createPublishableDueContent(session.workspace.id);
    await persistTestInstagramConnection({ workspaceId: session.workspace.id, actorId: session.user.id, accessToken: "test-token" });
    const publisher: InstagramPublisher = {
      async getPublishingLimit() {
        return {
          quotaDurationSeconds: 86400,
          quotaTotal: 50,
          quotaUsage: 50
        };
      },
      async publish() {
        throw new Error("publish should not be called when the cap is reached");
      }
    };

    const attempt = await publishContentItem(session.workspace.id, content.id, { publisher });
    const after = await prisma.contentItem.findUniqueOrThrow({
      where: {
        id: content.id
      }
    });

    expect(attempt).toMatchObject({
      contentItemId: content.id,
      dryRun: false,
      publishingLimit: {
        quotaDurationSeconds: 86400,
        quotaTotal: 50,
        quotaUsage: 50
      },
      reasons: ["INSTAGRAM_DAILY_PUBLISHING_LIMIT_REACHED"],
      status: "BLOCKED"
    });
    expect(after.status).toBe("SCHEDULED");
    expect(after.publishedAt).toBeNull();

    await app.close();
  });

  it("blocks publishing when the Instagram limit cannot be checked", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const { content } = await createPublishableDueContent(session.workspace.id);
    await persistTestInstagramConnection({ workspaceId: session.workspace.id, actorId: session.user.id, accessToken: "test-token" });
    const publisher: InstagramPublisher = {
      async getPublishingLimit() {
        throw new InstagramPublishError("INSTAGRAM_PUBLISHING_LIMIT_CHECK_FAILED");
      },
      async publish() {
        throw new Error("publish should not be called without a cap check");
      }
    };

    const attempt = await publishContentItem(session.workspace.id, content.id, { publisher });
    const after = await prisma.contentItem.findUniqueOrThrow({
      where: {
        id: content.id
      }
    });

    expect(attempt).toMatchObject({
      contentItemId: content.id,
      dryRun: false,
      reasons: ["INSTAGRAM_PUBLISHING_LIMIT_CHECK_FAILED"],
      status: "BLOCKED"
    });
    expect(after.status).toBe("SCHEDULED");
    expect(after.publishedAt).toBeNull();

    await app.close();
  });
});

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = `publishing-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password: "CorrectHorseBattery99!",
      fullName: "Publishing User",
      workspaceName: `Publishing Workspace ${randomUUID()}`,
      locale: "en"
    }
  });

  const session = response.json().data;

  await prisma.user.update({
    data: {
      isVerified: true
    },
    where: {
      id: session.user.id
    }
  });

  return {
    ...session,
    user: {
      ...session.user,
      isVerified: true
    }
  };
}

async function createPublishableDueContent(workspaceId: string) {
  return createPublishableContent(workspaceId, new Date(Date.now() - 60 * 1000));
}

async function createPublishableFutureContent(workspaceId: string) {
  return createPublishableContent(workspaceId, new Date(Date.now() + 60 * 60 * 1000));
}

async function createPublishableContent(workspaceId: string, scheduledAt: Date) {
  const media = await prisma.mediaAsset.create({
    data: {
      workspaceId,
      type: "IMAGE",
      filename: "publish.jpg",
      s3Key: `s3:${workspaceId}/publish.jpg`,
      cdnUrl: "https://cdn.example.com/publish.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 120000,
      width: 1080,
      height: 1080
    }
  });
  const content = await prisma.contentItem.create({
    data: {
      workspaceId,
      contentType: "POST",
      status: "SCHEDULED",
      captionEn: "Ready to publish",
      hashtags: ["#Bahrain", "#MarkosAI"],
      mediaIds: [media.id],
      scheduledAt
    }
  });

  return { content, media };
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`
  };
}

async function steppedUpToken(userId: string, workspaceId: string): Promise<string> {
  return new SignJWT({
    workspaceId,
    roles: ["OWNER"],
    mfaVerified: true,
    mfaVerifiedUntil: Math.floor(Date.now() / 1000) + 900
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
}

function monthStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function nextMonthStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function restoreProcessEnv(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
