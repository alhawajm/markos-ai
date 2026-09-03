import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiServiceRequestError } from "../src/ai/request";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { instagramJpegFixture } from "./helpers/jpeg";

const imageMock = vi.hoisted(() => ({ calls: 0, error: undefined as Error | undefined }));

vi.mock("../src/ai/image-client", () => ({
  generateImageAsset: async (input: { aspectRatio: string; prompt: string; workspaceId: string }) => {
    imageMock.calls += 1;
    if (imageMock.error) throw imageMock.error;
    const dimensions = {
      "1:1": { height: 1024, width: 1024 },
      "4:5": { height: 1280, width: 1024 },
      "9:16": { height: 1792, width: 1008 }
    }[input.aspectRatio] ?? { height: 1280, width: 1024 };
    const bytes = instagramJpegFixture(dimensions.width, dimensions.height);

    return {
      base64_data: bytes.toString("base64"),
      filename: "generated-test.jpg",
      height: dimensions.height,
      mime_type: "image/jpeg",
      model: "test-image-model",
      prompt: input.prompt,
      prompt_version: "image.v1.test",
      size_bytes: bytes.byteLength,
      tokens_in: 31,
      tokens_out: 7,
      width: dimensions.width
    };
  }
}));

afterEach(() => {
  imageMock.error = undefined;
});

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
      used: 245000n
    });

    await app.close();
  });

  it("uploads local media bytes and serves the stored file", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const bytes = instagramJpegFixture(924, 875);

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
        width: 924,
        height: 875,
        workspaceId: session.workspace.id
      }
    });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toContain("image/jpeg");
    expect(served.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(served.rawPayload).toEqual(bytes);

    await app.close();
  });

  it("rejects renamed files and JPEGs outside the Instagram feed contract before storage", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    const invalidBytes = await app.inject({
      method: "POST",
      url: "/v1/media/upload",
      headers,
      payload: {
        type: "IMAGE",
        filename: "renamed.jpg",
        mimeType: "image/jpeg",
        base64Data: Buffer.from("not really a JPEG").toString("base64")
      }
    });
    const narrowWidth = await app.inject({
      method: "POST",
      url: "/v1/media/upload",
      headers,
      payload: {
        type: "IMAGE",
        filename: "small.jpg",
        mimeType: "image/jpeg",
        base64Data: instagramJpegFixture(200, 200).toString("base64")
      }
    });
    const unsupportedRatio = await app.inject({
      method: "POST",
      url: "/v1/media/upload",
      headers,
      payload: {
        type: "IMAGE",
        filename: "tall.jpg",
        mimeType: "image/jpeg",
        base64Data: instagramJpegFixture(1080, 1920).toString("base64")
      }
    });

    expect(invalidBytes.statusCode).toBe(400);
    expect(invalidBytes.json()).toMatchObject({
      error: {
        code: "MEDIA_UPLOAD_INVALID",
        message: expect.stringContaining("valid JPEG")
      }
    });
    expect(narrowWidth.statusCode).toBe(400);
    expect(narrowWidth.json().error.message).toContain("between 320 and 1440 pixels wide");
    expect(unsupportedRatio.statusCode).toBe(400);
    expect(unsupportedRatio.json().error.message).toContain("between 4:5 and 1.91:1");
    await expect(prisma.mediaAsset.count({ where: { workspaceId: session.workspace.id } })).resolves.toBe(0);

    await app.close();
  });

  it("deletes an unattached uploaded object only inside its workspace", async () => {
    const app = await buildApp();
    const owner = await registerTestUser(app);
    const otherWorkspace = await registerTestUser(app);
    const bytes = instagramJpegFixture();
    const uploaded = await app.inject({
      method: "POST",
      url: "/v1/media/upload",
      headers: authHeaders(owner.tokens.accessToken),
      payload: {
        type: "IMAGE",
        filename: "disposable.jpg",
        mimeType: "image/jpeg",
        base64Data: bytes.toString("base64")
      }
    });
    const mediaId = uploaded.json().data.id as string;
    const publicPath = new URL(uploaded.json().data.publicUrl as string).pathname;
    const crossWorkspaceDelete = await app.inject({
      method: "DELETE",
      url: `/v1/media/${mediaId}`,
      headers: authHeaders(otherWorkspace.tokens.accessToken)
    });
    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/media/${mediaId}`,
      headers: authHeaders(owner.tokens.accessToken)
    });
    const servedAfterDelete = await app.inject({ method: "GET", url: publicPath });
    const listedAfterDelete = await app.inject({
      method: "GET",
      url: "/v1/media",
      headers: authHeaders(owner.tokens.accessToken)
    });

    expect(crossWorkspaceDelete.statusCode).toBe(404);
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ data: { id: mediaId } });
    expect(servedAfterDelete.statusCode).toBe(404);
    expect(listedAfterDelete.json().data).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: mediaId })]));
    await expect(
      prisma.usageCounter.findUniqueOrThrow({
        where: {
          workspaceId_metric_periodStart: {
            workspaceId: owner.workspace.id,
            metric: "STORAGE_BYTES",
            periodStart: storagePeriodStart()
          }
        }
      })
    ).resolves.toMatchObject({ used: 0n });

    await app.close();
  });

  it("requires an asset to be detached before deleting it", async () => {
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
        filename: "attached.jpg",
        publicUrl: "https://cdn.example.com/attached.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1000
      }
    });
    const mediaId = registered.json().data.id as string;
    await app.inject({
      method: "POST",
      url: `/v1/content/${content.id}/media`,
      headers,
      payload: { mediaAssetId: mediaId }
    });
    const blocked = await app.inject({ method: "DELETE", url: `/v1/media/${mediaId}`, headers });

    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ error: { code: "MEDIA_IN_USE" } });

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
        filename: "generated-test.jpg",
        mimeType: "image/jpeg",
        width: 1024,
        height: 1280
      },
      model: "test-image-model",
      prompt: "Premium Bahrain coffee product photo",
      promptVersion: "image.v1.test"
    });
    expect(served.statusCode).toBe(200);
    expect(served.rawPayload).toEqual(instagramJpegFixture(1024, 1280));
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
      used: 1n,
      limit: 20n
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
      used: 31n
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
      used: 7n
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
      used: BigInt(body.mediaAsset.sizeBytes)
    });

    await app.close();
  });

  it("returns the honest provider-disabled error without creating fake media", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const content = await createDraftContent(session.workspace.id);

    imageMock.error = new AiServiceRequestError({
      code: "AI_IMAGE_GENERATION_DISABLED",
      message: "AI image generation is not available in this environment. Upload an image instead",
      retryable: false,
      statusCode: 503
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/content/${content.id}/generate-image`,
      headers,
      payload: {
        aspectRatio: "4:5",
        prompt: "Premium Bahrain coffee product photo"
      }
    });
    const generatedAssets = await prisma.mediaAsset.count({
      where: { workspaceId: session.workspace.id, type: "AI_GENERATED" }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: {
        code: "AI_IMAGE_GENERATION_DISABLED",
        details: [{ retryable: false }],
        message: "AI image generation is not available in this environment. Upload an image instead"
      }
    });
    expect(generatedAssets).toBe(0);

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

  it("requires an approved post to return to draft before its media can change", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const content = await createDraftContent(session.workspace.id);
    const media = await prisma.mediaAsset.create({
      data: {
        workspaceId: session.workspace.id,
        type: "IMAGE",
        filename: "approved.jpg",
        s3Key: "external:https://cdn.example.com/approved.jpg",
        cdnUrl: "https://cdn.example.com/approved.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 120000,
        width: 1080,
        height: 1080
      }
    });
    await prisma.contentItem.update({ where: { id: content.id }, data: { status: "APPROVED" } });

    const response = await app.inject({
      method: "POST",
      url: `/v1/content/${content.id}/media`,
      headers,
      payload: {
        mediaAssetId: media.id
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("CONTENT_LOCKED");

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
    expect(storageCounter?.used ?? 0n).toBe(0n);

    await app.close();
  });

  it("checks the AI image quota before calling the provider", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const content = await createDraftContent(session.workspace.id);
    const providerCallsBefore = imageMock.calls;

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
      url: `/v1/content/${content.id}/generate-image`,
      headers,
      payload: {
        aspectRatio: "4:5",
        prompt: "A Bahrain coffee product image"
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: "QUOTA_EXCEEDED",
        details: [{ metric: "AI_IMAGE" }]
      }
    });
    expect(imageMock.calls).toBe(providerCallsBefore);

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
        base64Data: instagramJpegFixture().toString("base64")
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
