import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

vi.mock("../src/ai/embeddings-client", () => ({
  embedVaultTexts: async (texts: string[]) => ({
    model: "test-embedding-model",
    dimensions: 1536,
    embeddings: texts.map(testEmbedding)
  })
}));

describe("brand kit and brand book routes", () => {
  it("requires approved Vault memory before exporting a brand book", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app, "brand-empty");

    const response = await app.inject({
      method: "POST",
      url: "/v1/brand-book/exports",
      headers: authHeaders(session.tokens.accessToken),
      payload: {}
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: "BRAND_KIT_CONTEXT_MISSING"
      }
    });

    await app.close();
  });

  it("builds a source-grounded Brand Kit and stores versioned exports with audit logs", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app, "brand-flow");
    const headers = authHeaders(session.tokens.accessToken);
    await seedBrandVault(app, headers);
    await prisma.mediaAsset.create({
      data: {
        workspaceId: session.workspace.id,
        type: "BRAND_ASSET",
        filename: "raedat-logo.svg",
        s3Key: "brand/raedat-logo.svg",
        cdnUrl: "https://cdn.markos.test/brand/raedat-logo.svg",
        mimeType: "image/svg+xml",
        sizeBytes: 1200
      }
    });

    const kitResponse = await app.inject({
      method: "GET",
      url: "/v1/brand-kit",
      headers
    });
    const kit = kitResponse.json().data;

    expect(kitResponse.statusCode).toBe(200);
    expect(kit).toMatchObject({
      workspaceId: session.workspace.id,
      unsupportedClaims: [],
      assets: [expect.objectContaining({ filename: "raedat-logo.svg" })]
    });
    expect(kit.sourceEntries.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(kit.toneRules)).toContain("Warm");
    expect(JSON.stringify(kit.visualRules)).toContain("#81D8D0");
    expect(JSON.stringify(kit)).not.toContain("TikTok");

    const firstExport = await app.inject({
      method: "POST",
      url: "/v1/brand-book/exports",
      headers,
      payload: {}
    });
    const firstExportBody = firstExport.json().data;

    expect(firstExport.statusCode).toBe(200);
    expect(firstExportBody).toMatchObject({
      workspaceId: session.workspace.id,
      version: 1,
      title: "MARKOS Brand Book v1",
      status: "EXPORTED",
      content: {
        workspaceId: session.workspace.id,
        unsupportedClaims: []
      }
    });
    expect(firstExportBody.sourceEntryIds).toEqual(expect.arrayContaining(kit.sourceEntries.map((entry: { id: string }) => entry.id)));

    const secondExport = await app.inject({
      method: "POST",
      url: "/v1/brand-book/exports",
      headers,
      payload: {}
    });

    expect(secondExport.statusCode).toBe(200);
    expect(secondExport.json().data.version).toBe(2);

    await expect(
      prisma.auditLog.findFirstOrThrow({
        where: {
          workspaceId: session.workspace.id,
          action: "brand_book.exported",
          targetId: firstExportBody.id
        }
      })
    ).resolves.toMatchObject({
      actorId: session.user.id,
      targetType: "brand_book_export"
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/brand-book/exports?limit=2",
      headers
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data.map((item: { version: number }) => item.version)).toEqual([2, 1]);

    await app.close();
  });

  it("does not leak Brand Book exports across workspaces", async () => {
    const app = await buildApp();
    const owner = await registerTestUser(app, "brand-owner");
    const other = await registerTestUser(app, "brand-other");
    const ownerHeaders = authHeaders(owner.tokens.accessToken);
    await seedBrandVault(app, ownerHeaders);

    const exported = await app.inject({
      method: "POST",
      url: "/v1/brand-book/exports",
      headers: ownerHeaders,
      payload: {}
    });
    const exportId = exported.json().data.id;

    const crossWorkspaceRead = await app.inject({
      method: "GET",
      url: `/v1/brand-book/exports/${exportId}`,
      headers: authHeaders(other.tokens.accessToken)
    });

    expect(crossWorkspaceRead.statusCode).toBe(404);

    await app.close();
  });
});

async function registerTestUser(app: FastifyInstance, label: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `${label}-${randomUUID()}@markos.test`,
      password: "CorrectHorseBattery99!",
      fullName: "Brand User",
      workspaceName: `Brand Workspace ${randomUUID()}`,
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

async function seedBrandVault(app: FastifyInstance, headers: Record<string, string>): Promise<void> {
  await app.inject({
    method: "PUT",
    url: "/v1/vault/company",
    headers,
    payload: {
      entries: [
        {
          key: "profile",
          value: {
            industry: "women-led entrepreneurship community",
            location: "Bahrain",
            name: "Raedat"
          }
        }
      ]
    }
  });
  await app.inject({
    method: "PUT",
    url: "/v1/vault/brand",
    headers,
    payload: {
      entries: [
        {
          key: "identity",
          value: {
            aestheticWords: ["credible", "human", "premium"],
            colors: ["#81D8D0", "#D4AF37"],
            fonts: ["Inter"],
            toneWords: ["Warm", "clear", "empowering"],
            voiceNotes: "Speak with practical confidence and avoid exaggerated claims."
          }
        }
      ]
    }
  });
  await app.inject({
    method: "PUT",
    url: "/v1/vault/story",
    headers,
    payload: {
      entries: [
        {
          key: "mission",
          value: {
            mission: "Support Bahrain women founders with practical marketing guidance and business visibility."
          }
        }
      ]
    }
  });
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`
  };
}

function testEmbedding(text: string): number[] {
  const vector = Array.from({ length: 1536 }, () => 0);

  for (const token of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    const index = token.charCodeAt(0) % vector.length;
    vector[index] = (vector[index] ?? 0) + 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  return norm === 0 ? vector : vector.map((value) => value / norm);
}
