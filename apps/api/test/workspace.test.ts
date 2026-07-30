import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { persistTestInstagramConnection } from "./helpers/instagram-connection";

describe("workspace routes", () => {
  it("connects and disconnects Instagram metadata", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const accountId = `workspace-account-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    const initial = await app.inject({
      method: "GET",
      url: "/v1/workspace/instagram",
      headers
    });
    await persistTestInstagramConnection({
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      accountId,
      expiresAt: new Date(expiresAt)
    });
    const connected = await app.inject({ method: "GET", url: "/v1/workspace/instagram", headers });
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
        accountId,
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
      targetId: accountId,
      targetType: "InstagramConnection"
    });
    expect(auditLogs[1]).toMatchObject({
      action: "INSTAGRAM_DISCONNECTED",
      actorId: session.user.id,
      targetId: accountId,
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

    await persistTestInstagramConnection({ workspaceId: session.workspace.id, actorId: session.user.id });
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
    expect(response.json().error.code).toBe("RBAC_FORBIDDEN");

    await app.close();
  });

  it("exports workspace data without leaking another workspace", async () => {
    const app = await buildApp();
    const first = await registerTestUser(app);
    const second = await registerTestUser(app);

    await prisma.knowledgeVault.createMany({
      data: [
        {
          key: "profile",
          section: "COMPANY",
          value: { business: "First workspace" },
          workspaceId: first.workspace.id
        },
        {
          key: "profile",
          section: "COMPANY",
          value: { business: "Second workspace" },
          workspaceId: second.workspace.id
        }
      ]
    });
    await prisma.contentItem.create({
      data: {
        captionEn: "First content",
        contentType: "POST",
        hashtags: [],
        mediaIds: [],
        workspaceId: first.workspace.id
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/workspace/data-export",
      headers: authHeaders(first.tokens.accessToken)
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toContain(`markos-workspace-${first.workspace.id}-export.json`);
    expect(response.json().data).toMatchObject({
      owner: {
        email: first.user.email,
        id: first.user.id
      },
      workspace: {
        id: first.workspace.id,
        ownerUserId: first.user.id
      }
    });
    expect(response.json().data.records.vault).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "profile",
          workspaceId: first.workspace.id
        })
      ])
    );
    expect(JSON.stringify(response.json().data)).not.toContain(second.workspace.id);
    expect(JSON.stringify(response.json().data)).not.toContain("Second workspace");

    await app.close();
  });

  it("requires workspace admin access for workspace data export", async () => {
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
      url: "/v1/workspace/data-export",
      headers: authHeaders(session.tokens.accessToken)
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("RBAC_FORBIDDEN");

    await app.close();
  });

  it("erases workspace data, anonymizes the sole owner, and records audit evidence", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);

    const vault = await prisma.knowledgeVault.create({
      data: {
        key: "profile",
        section: "COMPANY",
        value: { business: "Erase me" },
        workspaceId: session.workspace.id
      }
    });
    await prisma.knowledgeVaultHistory.create({
      data: {
        key: vault.key,
        knowledgeVaultId: vault.id,
        section: vault.section,
        value: { business: "Erase me" },
        version: 1,
        workspaceId: session.workspace.id
      }
    });
    await prisma.contentItem.create({
      data: {
        captionEn: "Delete this",
        contentType: "POST",
        hashtags: [],
        mediaIds: [],
        workspaceId: session.workspace.id
      }
    });
    await prisma.mediaAsset.create({
      data: {
        cdnUrl: "https://cdn.example.com/delete.jpg",
        filename: "delete.jpg",
        mimeType: "image/jpeg",
        s3Key: "external:https://cdn.example.com/delete.jpg",
        sizeBytes: 1000,
        type: "IMAGE",
        workspaceId: session.workspace.id
      }
    });
    await prisma.usageCounter.create({
      data: {
        limit: 10,
        metric: "AI_GENERATION",
        periodEnd: new Date("2026-07-01T00:00:00.000Z"),
        periodStart: new Date("2026-06-01T00:00:00.000Z"),
        used: 1,
        workspaceId: session.workspace.id
      }
    });
    await prisma.notification.create({
      data: {
        channel: "in_app",
        payload: { message: "personal" },
        templateKey: "test",
        userId: session.user.id,
        workspaceId: session.workspace.id
      }
    });

    const invalidConfirmation = await app.inject({
      method: "POST",
      url: "/v1/workspace/data-erasure",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        confirm: "DELETE"
      }
    });
    const erased = await app.inject({
      method: "POST",
      url: "/v1/workspace/data-erasure",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        confirm: "ERASE_WORKSPACE_DATA"
      }
    });

    expect(invalidConfirmation.statusCode).toBe(400);
    expect(erased.statusCode).toBe(200);
    expect(erased.json().data).toMatchObject({
      ownerAnonymized: true,
      userId: session.user.id,
      workspaceId: session.workspace.id
    });
    expect(erased.json().data.counts).toMatchObject({
      contentItems: 1,
      knowledgeVault: 1,
      knowledgeVaultHistory: 1,
      mediaAssets: 1,
      notifications: 1,
      usageCounters: 1,
      workspaceMembers: 1,
      workspaces: 1
    });

    await expect(prisma.workspace.findUniqueOrThrow({ where: { id: session.workspace.id } })).resolves.toMatchObject({
      deletedAt: expect.any(Date),
      instagramAccessToken: null
    });
    await expect(prisma.user.findUniqueOrThrow({ where: { id: session.user.id } })).resolves.toMatchObject({
      deletedAt: expect.any(Date),
      email: `deleted-${session.user.id}@markos.invalid`,
      fullName: "Deleted user",
      passwordHash: null
    });
    await expect(prisma.usageCounter.count({ where: { workspaceId: session.workspace.id } })).resolves.toBe(0);
    await expect(prisma.knowledgeVaultHistory.count({ where: { workspaceId: session.workspace.id } })).resolves.toBe(0);
    await expect(
      prisma.auditLog.findFirstOrThrow({
        where: {
          action: "WORKSPACE_DATA_ERASED",
          workspaceId: session.workspace.id
        }
      })
    ).resolves.toMatchObject({
      actorId: session.user.id,
      targetId: session.workspace.id,
      targetType: "Workspace"
    });

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


function authHeaders(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`
  };
}
