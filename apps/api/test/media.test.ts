import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

vi.mock("../src/ai/image-client", () => ({
  generateImageAsset: async (input: { aspectRatio: string; prompt: string; workspaceId: string }) => {
    const bytes = Buffer.from(`<svg>${input.workspaceId}:${input.aspectRatio}:${input.prompt}</svg>`);

    return {
      base64_data: bytes.toString("base64"),
      filename: "generated-test.svg",
      height: 1350,
      mime_type: "image/svg+xml",
      model: "test-image-model",
      prompt: input.prompt,
      prompt_version: "image.v1.test",
      size_bytes: bytes.byteLength,
      tokens_in: 31,
      tokens_out: 7,
      width: 1080
    };
  }
}));

describe("media routes", () => {
  it("registers public media and attaches it to content", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const content = await createDraftContent(session.workspace.id);

    const registered = await app.inject({
      method: "POST",
      url: "/v1/media/public-url",
      headers,
      payload: {
        type: "IMAGE",
        filename: "menu-post.jpg",
        publicUrl: "https://cdn.example.com/menu-post.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 245000,
        width: 1080,
        height: 1080
      }
    });
    const mediaId = registered.json().data.id as string;
    const attached = await app.inject({
      method: "POST",
      url: `/v1/content/${content.id}/media`,
      headers,
      payload: {
        mediaAssetId: mediaId
      }
    });
    const list = await app.inject({
      method: "GET",
      url: "/v1/media",
      headers
    });

    expect(registered.statusCode).toBe(200);
    expect(registered.json()).toMatchObject({
      data: {
        filename: "menu-post.jpg",
        publicUrl: "https://cdn.example.com/menu-post.jpg",
        workspaceId: session.workspace.id
      }
    });
    expect(attached.statusCode).toBe(200);
    expect(attached.json().data.mediaIds).toEqual([mediaId]);
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: mediaId,
          publicUrl: "https://cdn.example.com/menu-post.jpg"
        })
      ])
    );
    await expect(
      prisma.usageCounter.findUniqueOrThrow({
        where: {
          workspaceId_metric_periodStart: {
            workspaceId: session.workspace.id,
            metric: "STORAGE_BYTES",
            periodStart: storagePeriodStart()
          }
        }
      })
    ).resolves.toMatchObject({
      used: 245000
    });

    await app.close();
  });

  it("uploads local media bytes and serves the stored file", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const bytes = Buffer.from("markos media upload");

    const uploaded = await app.inject({
      method: "POST",
      url: "/v1/media/upload",
      headers,
      payload: {
        type: "IMAGE",
        filename: "upload.jpg",
        mimeType: "image/jpeg",
        base64Data: bytes.toString("base64")
      }
    });
    const publicUrl = uploaded.json().data.publicUrl as string;
    const served = await app.inject({
      method: "GET",
      url: new URL(publicUrl).pathname
    });

    expect(uploaded.statusCode).toBe(200);
    expect(uploaded.json()).toMatchObject({
      data: {
        filename: "upload.jpg",
        mimeType: "image/jpeg",
        sizeBytes: bytes.byteLength,
        workspaceId: session.workspace.id
      }
    });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toContain("image/jpeg");
    expect(served.body).toBe("markos media upload");

    await app.close();
  });

  it("generates an AI image for content, attaches it, and meters usage", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const content = await createDraftContent(session.workspace.id);
    const periodStart = monthStart();

    const response = await app.inject({
      method: "POST",
      url: `/v1/content/${content.id}/generate-image`,
      headers,
      payload: {
        aspectRatio: "4:5",
        prompt: "Premium Bahrain coffee product photo"
      }
    });
    const body = response.json().data;
    const assetId = body.mediaAsset.id as string;
    const served = await app.inject({
      method: "GET",
      url: new URL(body.mediaAsset.publicUrl as string).pathname
    });
    const interaction = await prisma.aiInteraction.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id,
        agent: "IMAGE"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      contentItem: {
        id: content.id,
        mediaIds: [assetId]
      },
      mediaAsset: {
        id: assetId,
        type: "AI_GENERATED",
        filename: "generated-test.svg",
        mimeType: "image/svg+xml",
        width: 1080,
        height: 1350
      },
      model: "test-image-model",
      prompt: "Premium Bahrain coffee product photo",
      promptVersion: "image.v1.test"
    });
    expect(served.statusCode).toBe(200);
    expect(served.body).toContain("Premium Bahrain coffee product photo");
    expect(interaction).toMatchObject({
      promptVersion: "image.v1.test",
      tokensIn: 31,
      tokensOut: 7,
      costMinor: 0,
      currency: "BHD",
      model: "test-image-model"
    });
    await expect(
      prisma.usageCounter.findUniqueOrThrow({
        where: {
          workspaceId_metric_periodStart: {
            workspaceId: session.workspace.id,
            metric: "AI_IMAGE",
            periodStart
          }
        }
      })
    ).resolves.toMatchObject({
      used: 1,
      limit: 20
    });
    await expect(
      prisma.usageCounter.findUniqueOrThrow({
        where: {
          workspaceId_metric_periodStart: {
            workspaceId: session.workspace.id,
            metric: "AI_TOKENS_IN",
            periodStart
          }
        }
      })
    ).resolves.toMatchObject({
      used: 31
    });
    await expect(
      prisma.usageCounter.findUniqueOrThrow({
        where: {
          workspaceId_metric_periodStart: {
            workspaceId: session.workspace.id,
            metric: "AI_TOKENS_OUT",
            periodStart
          }
        }
      })
    ).resolves.toMatchObject({
      used: 7
    });
    await expect(
      prisma.usageCounter.findUniqueOrThrow({
        where: {
          workspaceId_metric_periodStart: {
            workspaceId: session.workspace.id,
            metric: "STORAGE_BYTES",
            periodStart: storagePeriodStart()
          }
        }
      })
    ).resolves.toMatchObject({
      used: body.mediaAsset.sizeBytes
    });

    await app.close();
  });

  it("does not attach media from another workspace", async () => {
    const app = await buildApp();
    const owner = await registerTestUser(app);
    const other = await registerTestUser(app);
    const ownerHeaders = authHeaders(owner.tokens.accessToken);
    const content = await createDraftContent(owner.workspace.id);
    const foreignMedia = await prisma.mediaAsset.create({
      data: {
        workspaceId: other.workspace.id,
        type: "IMAGE",
        filename: "foreign.jpg",
        s3Key: "external:https://cdn.example.com/foreign.jpg",
        cdnUrl: "https://cdn.example.com/foreign.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 120000
      }
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/content/${content.id}/media`,
      headers: ownerHeaders,
      payload: {
        mediaAssetId: foreignMedia.id
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("MEDIA_NOT_FOUND");

    await app.close();
  });

  it("requires HTTPS public media URLs", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    const response = await app.inject({
      method: "POST",
      url: "/v1/media/public-url",
      headers,
      payload: {
        type: "IMAGE",
        filename: "local.jpg",
        publicUrl: "http://example.com/local.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1000
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");

    await app.close();
  });

  it("blocks media registration when storage quota is exhausted", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    await prisma.usageCounter.create({
      data: {
        workspaceId: session.workspace.id,
        metric: "STORAGE_BYTES",
        periodStart: storagePeriodStart(),
        periodEnd: storagePeriodEnd(),
        used: 1_000_000_000,
        limit: 1_000_000_000
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/media/public-url",
      headers,
      payload: {
        type: "IMAGE",
        filename: "too-much.jpg",
        publicUrl: "https://cdn.example.com/too-much.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: "QUOTA_EXCEEDED",
        details: [
          {
            metric: "STORAGE_BYTES"
          }
        ]
      }
    });

    await app.close();
  });

  it("blocks AI generated media when the AI image quota is exhausted", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    await prisma.usageCounter.create({
      data: {
        workspaceId: session.workspace.id,
        metric: "AI_IMAGE",
        periodStart: monthStart(),
        periodEnd: nextMonthStart(),
        used: 20,
        limit: 20
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/media/public-url",
      headers,
      payload: {
        type: "AI_GENERATED",
        filename: "generated.jpg",
        publicUrl: "https://cdn.example.com/generated.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1000
      }
    });
    const storageCounter = await prisma.usageCounter.findUnique({
      where: {
        workspaceId_metric_periodStart: {
          workspaceId: session.workspace.id,
          metric: "STORAGE_BYTES",
          periodStart: storagePeriodStart()
        }
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: "QUOTA_EXCEEDED",
        details: [
          {
            metric: "AI_IMAGE"
          }
        ]
      }
    });
    expect(storageCounter?.used ?? 0).toBe(0);

    await app.close();
  });

  it("blocks media upload when billing is cancelled", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    await prisma.user.update({
      data: {
        planStatus: "CANCELLED"
      },
      where: {
        id: session.user.id
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/media/upload",
      headers,
      payload: {
        type: "IMAGE",
        filename: "cancelled.jpg",
        mimeType: "image/jpeg",
        base64Data: Buffer.from("blocked media").toString("base64")
      }
    });

    expect(response.statusCode).toBe(402);
    expect(response.json()).toMatchObject({
      error: {
        code: "BILLING_STATUS_INACTIVE",
        details: [
          {
            status: "CANCELLED"
          }
        ]
      }
    });

    await app.close();
  });
});

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = `media-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password: "CorrectHorseBattery99!",
      fullName: "Media User",
      workspaceName: `Media Workspace ${randomUUID()}`,
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

async function createDraftContent(workspaceId: string) {
  return prisma.contentItem.create({
    data: {
      workspaceId,
      contentType: "POST",
      status: "DRAFT",
      captionEn: "Draft with media",
      hashtags: ["#Bahrain"],
      mediaIds: []
    }
  });
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

function storagePeriodStart(): Date {
  return new Date(Date.UTC(1970, 0, 1));
}

function storagePeriodEnd(): Date {
  return new Date(Date.UTC(9999, 11, 31));
}
