import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

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

  return response.json().data;
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
