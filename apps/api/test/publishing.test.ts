import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { MetaGraphPublishError, type InstagramPublisher } from "../src/publishing/instagram-publisher";
import { publishContentItem } from "../src/publishing/publishing-service";

describe("publishing routes", () => {
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
    const { content, media } = await createPublishableDueContent(session.workspace.id);

    await connectInstagram(app, headers);

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
            accountId: "17841400000000000",
            caption: "Ready to publish\n\n#Bahrain #MarkosAI",
            contentItemId: content.id,
            contentType: "POST",
            mediaUrls: [media.cdnUrl]
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

  it("runs due publishing only for due content in the active workspace", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const due = await createPublishableDueContent(session.workspace.id);
    await createPublishableFutureContent(session.workspace.id);
    await connectInstagram(app, headers);

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
    await prisma.workspace.update({
      where: {
        id: session.workspace.id
      },
      data: {
        instagramAccessToken: "test-token",
        instagramAccountId: "17841400000000000",
        instagramTokenExpiresAt: new Date(Date.now() + 3600000)
      }
    });
    const publisher: InstagramPublisher = {
      async publish() {
        throw new MetaGraphPublishError("Meta rejected the media container");
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
      reasons: ["Meta rejected the media container"],
      status: "FAILED"
    });
    expect(failed.status).toBe("FAILED");
    expect(failed.failureReason).toBe("Meta rejected the media container");

    await app.close();
  });

  it("meters successful live publishes against the MARKOS post quota", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const { content } = await createPublishableDueContent(session.workspace.id);

    await prisma.workspace.update({
      where: {
        id: session.workspace.id
      },
      data: {
        instagramAccessToken: "test-token",
        instagramAccountId: "17841400000000000",
        instagramTokenExpiresAt: new Date(Date.now() + 3600000)
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
        return {
          dryRun: false,
          instagramPostId: "ig-post-1",
          payload: {
            accountId: "17841400000000000",
            caption: "Ready to publish\n\n#Bahrain #MarkosAI",
            contentItemId: content.id,
            contentType: "POST",
            mediaUrls: ["https://cdn.example.com/publish.jpg"]
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

  it("blocks live publishing when the MARKOS post quota is exhausted", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const { content } = await createPublishableDueContent(session.workspace.id);

    await prisma.workspace.update({
      where: {
        id: session.workspace.id
      },
      data: {
        instagramAccessToken: "test-token",
        instagramAccountId: "17841400000000000",
        instagramTokenExpiresAt: new Date(Date.now() + 3600000)
      }
    });
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
    await prisma.workspace.update({
      where: {
        id: session.workspace.id
      },
      data: {
        instagramAccessToken: "test-token",
        instagramAccountId: "17841400000000000",
        instagramTokenExpiresAt: new Date(Date.now() + 3600000)
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
    await prisma.workspace.update({
      where: {
        id: session.workspace.id
      },
      data: {
        instagramAccessToken: "test-token",
        instagramAccountId: "17841400000000000",
        instagramTokenExpiresAt: new Date(Date.now() + 3600000)
      }
    });
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
    await prisma.workspace.update({
      where: {
        id: session.workspace.id
      },
      data: {
        instagramAccessToken: "test-token",
        instagramAccountId: "17841400000000000",
        instagramTokenExpiresAt: new Date(Date.now() + 3600000)
      }
    });
    const publisher: InstagramPublisher = {
      async getPublishingLimit() {
        throw new MetaGraphPublishError("Meta publishing limit check failed");
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
      reasons: ["Meta publishing limit check failed"],
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

  return response.json().data;
}

async function connectInstagram(app: Awaited<ReturnType<typeof buildApp>>, headers: Record<string, string>): Promise<void> {
  await app.inject({
    method: "PUT",
    url: "/v1/workspace/instagram",
    headers,
    payload: {
      accountId: "17841400000000000",
      accessToken: "test-instagram-token",
      tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    }
  });
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
      s3Key: "external:https://cdn.example.com/publish.jpg",
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

function monthStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function nextMonthStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}
