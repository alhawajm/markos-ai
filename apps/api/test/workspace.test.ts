import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

describe("workspace routes", () => {
  it("connects and disconnects Instagram metadata", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    const initial = await app.inject({
      method: "GET",
      url: "/v1/workspace/instagram",
      headers
    });
    const connected = await app.inject({
      method: "PUT",
      url: "/v1/workspace/instagram",
      headers,
      payload: {
        accountId: "17841400000000000",
        accessToken: "test-instagram-token",
        tokenExpiresAt: expiresAt
      }
    });
    const disconnected = await app.inject({
      method: "DELETE",
      url: "/v1/workspace/instagram",
      headers
    });

    expect(initial.statusCode).toBe(200);
    expect(initial.json().data.connected).toBe(false);
    expect(connected.statusCode).toBe(200);
    expect(connected.json()).toMatchObject({
      data: {
        accountId: "17841400000000000",
        connected: true,
        tokenExpiresAt: expiresAt
      }
    });
    expect(disconnected.statusCode).toBe(200);
    expect(disconnected.json().data.connected).toBe(false);
    const auditLogs = await prisma.auditLog.findMany({
      orderBy: {
        createdAt: "asc"
      },
      where: {
        action: {
          in: ["INSTAGRAM_CONNECTED", "INSTAGRAM_DISCONNECTED"]
        },
        workspaceId: session.workspace.id
      }
    });
    expect(auditLogs).toHaveLength(2);
    expect(auditLogs[0]).toMatchObject({
      action: "INSTAGRAM_CONNECTED",
      actorId: session.user.id,
      targetId: "17841400000000000",
      targetType: "InstagramConnection"
    });
    expect(auditLogs[1]).toMatchObject({
      action: "INSTAGRAM_DISCONNECTED",
      actorId: session.user.id,
      targetId: "17841400000000000",
      targetType: "InstagramConnection"
    });

    await app.close();
  });

  it("reports publish readiness reasons without publishing", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const content = await prisma.contentItem.create({
      data: {
        workspaceId: session.workspace.id,
        contentType: "POST",
        status: "SCHEDULED",
        captionEn: "Ready soon",
        hashtags: ["#Bahrain"],
        mediaIds: [],
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000)
      }
    });

    const missingConnection = await app.inject({
      method: "GET",
      url: `/v1/workspace/publish-readiness/${content.id}`,
      headers
    });

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
    const media = await prisma.mediaAsset.create({
      data: {
        workspaceId: session.workspace.id,
        type: "IMAGE",
        filename: "post.jpg",
        s3Key: "external:https://cdn.example.com/post.jpg",
        cdnUrl: "https://cdn.example.com/post.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 120000,
        width: 1080,
        height: 1080
      }
    });
    await prisma.contentItem.update({
      where: {
        id: content.id
      },
      data: {
        mediaIds: [media.id]
      }
    });

    const ready = await app.inject({
      method: "GET",
      url: `/v1/workspace/publish-readiness/${content.id}`,
      headers
    });

    expect(missingConnection.statusCode).toBe(200);
    expect(missingConnection.json()).toMatchObject({
      data: {
        ready: false,
        reasons: ["INSTAGRAM_NOT_CONNECTED", "PUBLIC_MEDIA_REQUIRED"]
      }
    });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      data: {
        ready: true,
        reasons: []
      }
    });

    await app.close();
  });

  it("lists recent workspace audit logs without leaking other workspace events", async () => {
    const app = await buildApp();
    const first = await registerTestUser(app);
    const second = await registerTestUser(app);

    await prisma.auditLog.createMany({
      data: [
        {
          action: "INSTAGRAM_CONNECTED",
          metadata: {
            accountId: "17841400000000000"
          },
          targetId: "17841400000000000",
          targetType: "InstagramConnection",
          workspaceId: first.workspace.id
        },
        {
          action: "OTHER_WORKSPACE_EVENT",
          targetType: "Workspace",
          workspaceId: second.workspace.id
        },
        {
          action: "GLOBAL_META_WEBHOOK",
          targetType: "MetaWebhook"
        }
      ]
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/workspace/audit-logs?limit=10",
      headers: authHeaders(first.tokens.accessToken)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0]).toMatchObject({
      action: "INSTAGRAM_CONNECTED",
      metadata: {
        accountId: "17841400000000000"
      },
      targetId: "17841400000000000",
      targetType: "InstagramConnection",
      workspaceId: first.workspace.id
    });

    await app.close();
  });

  it("requires workspace admin access for audit logs", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);

    await prisma.workspaceMember.updateMany({
      data: {
        role: "VIEWER"
      },
      where: {
        userId: session.user.id,
        workspaceId: session.workspace.id
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/workspace/audit-logs",
      headers: authHeaders(session.tokens.accessToken)
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("AUDIT_LOGS_FORBIDDEN");

    await app.close();
  });
});

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = `workspace-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password: "CorrectHorseBattery99!",
      fullName: "Workspace User",
      workspaceName: `Workspace Test ${randomUUID()}`,
      locale: "en"
    }
  });

  return response.json().data;
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`
  };
}
