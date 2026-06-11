import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

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
