import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

const { embedVaultTextsMock } = vi.hoisted(() => ({
  embedVaultTextsMock: vi.fn(async (texts: string[]) => ({
    model: "test-embedding-model",
    dimensions: 1536,
    embeddings: texts.map(testEmbedding)
  }))
}));

vi.mock("../src/ai/embeddings-client", () => ({
  embedVaultTexts: embedVaultTextsMock
}));

describe("offering catalogue", () => {
  beforeEach(() => {
    embedVaultTextsMock.mockReset();
    embedVaultTextsMock.mockImplementation(async (texts: string[]) => ({
      model: "test-embedding-model",
      dimensions: 1536,
      embeddings: texts.map(testEmbedding)
    }));
  });

  it("makes approved Products onboarding data canonical and preserves structured offerings during a summary-only edit", async () => {
    const app = await buildApp();
    const session = await registerVerifiedUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const initial = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/products",
      headers,
      payload: {
        summary: "Coffee beans and recurring office coffee services.",
        items: [
          {
            kind: "PRODUCT",
            name: "Pearl Blend",
            category: "Coffee beans",
            priceMinor: 3500,
            currency: "BHD",
            description: "Medium roast blend for milk drinks."
          },
          {
            kind: "SERVICE",
            name: "Office Coffee Setup",
            category: "Office service",
            priceMinor: 25000,
            currency: "BHD",
            description: "Recurring office coffee supply."
          }
        ],
        differentiators: ["locally roasted"],
        salesChannels: ["Instagram DM"]
      }
    });

    expect(initial.statusCode).toBe(200);
    const firstCatalog = await prisma.offeringCatalog.findUniqueOrThrow({ where: { workspaceId: session.workspace.id } });
    const firstOfferings = await prisma.offering.findMany({ where: { workspaceId: session.workspace.id }, orderBy: { name: "asc" } });
    const firstVault = await prisma.knowledgeVault.findMany({
      where: { workspaceId: session.workspace.id, section: "PRODUCTS", deletedAt: null },
      orderBy: { key: "asc" }
    });

    expect(firstCatalog).toMatchObject({
      version: 1,
      projectedVersion: 1,
      projectionStatus: "READY",
      summary: "Coffee beans and recurring office coffee services."
    });
    expect(firstOfferings).toEqual([
      expect.objectContaining({ kind: "SERVICE", name: "Office Coffee Setup", status: "ACTIVE", version: 1 }),
      expect.objectContaining({ kind: "PRODUCT", name: "Pearl Blend", status: "ACTIVE", version: 1 })
    ]);
    expect(firstVault.map((entry) => entry.key)).toEqual(["catalog", ...firstOfferings.map((offering) => `offering:${offering.id}`).sort()]);
    expect(await prisma.offeringCatalogRevision.count({ where: { catalogId: firstCatalog.id } })).toBe(1);
    expect(await prisma.offeringRevision.count({ where: { workspaceId: session.workspace.id } })).toBe(2);

    const summaryEdit = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/products",
      headers,
      payload: { summary: "Coffee for homes, events, and offices across Bahrain." }
    });

    expect(summaryEdit.statusCode).toBe(200);
    const editedCatalog = await prisma.offeringCatalog.findUniqueOrThrow({ where: { workspaceId: session.workspace.id } });
    const retainedOfferings = await prisma.offering.findMany({ where: { workspaceId: session.workspace.id }, orderBy: { name: "asc" } });
    const projectedCatalog = await prisma.knowledgeVault.findFirstOrThrow({
      where: { workspaceId: session.workspace.id, section: "PRODUCTS", key: "catalog", deletedAt: null }
    });

    expect(editedCatalog).toMatchObject({ version: 2, projectedVersion: 2, projectionStatus: "READY" });
    expect(retainedOfferings.map((offering) => ({ id: offering.id, status: offering.status, version: offering.version }))).toEqual(
      firstOfferings.map((offering) => ({ id: offering.id, status: offering.status, version: offering.version }))
    );
    expect(projectedCatalog.value).toMatchObject({
      summary: "Coffee for homes, events, and offices across Bahrain.",
      items: expect.arrayContaining([expect.objectContaining({ name: "Pearl Blend" }), expect.objectContaining({ name: "Office Coffee Setup" })])
    });

    await app.close();
  });

  it("versions changes, archives removed offerings, and reuses stable offering identities", async () => {
    const app = await buildApp();
    const session = await registerVerifiedUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    await app.inject({
      method: "PUT",
      url: "/v1/onboarding/products",
      headers,
      payload: {
        summary: "Initial catalogue",
        items: [
          { name: "Pearl Blend", priceMinor: 3500, currency: "BHD" },
          { name: "Office Coffee Setup", currency: "BHD" }
        ]
      }
    });
    const initialPearl = await prisma.offering.findFirstOrThrow({ where: { workspaceId: session.workspace.id, normalizedName: "pearl blend" } });

    const update = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/products",
      headers,
      payload: {
        summary: "Updated catalogue",
        items: [
          { name: "Pearl Blend", priceMinor: 4000, currency: "BHD" },
          { kind: "SERVICE", name: "Event Coffee Bar", currency: "BHD" }
        ]
      }
    });

    expect(update.statusCode).toBe(200);
    const offerings = await prisma.offering.findMany({ where: { workspaceId: session.workspace.id }, orderBy: { name: "asc" } });
    expect(offerings).toEqual([
      expect.objectContaining({ kind: "SERVICE", name: "Event Coffee Bar", status: "ACTIVE", version: 1 }),
      expect.objectContaining({ name: "Office Coffee Setup", status: "ARCHIVED", version: 2 }),
      expect.objectContaining({ id: initialPearl.id, name: "Pearl Blend", priceMinor: 4000, status: "ACTIVE", version: 2 })
    ]);
    expect(await prisma.offeringRevision.count({ where: { offeringId: initialPearl.id } })).toBe(2);
    expect(
      await prisma.knowledgeVault.count({
        where: { workspaceId: session.workspace.id, section: "PRODUCTS", key: `offering:${offerings[1]!.id}`, deletedAt: null }
      })
    ).toBe(0);

    await app.close();
  });

  it("removes stale Products projections when embedding fails and can safely retry", async () => {
    const app = await buildApp();
    const session = await registerVerifiedUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    await app.inject({ method: "PUT", url: "/v1/onboarding/products", headers, payload: { summary: "Initial catalogue" } });

    embedVaultTextsMock.mockRejectedValueOnce(new Error("test embedding failure"));
    const failed = await app.inject({ method: "PUT", url: "/v1/onboarding/products", headers, payload: { summary: "Changed catalogue" } });

    expect(failed.statusCode).toBe(500);
    await expect(prisma.offeringCatalog.findUniqueOrThrow({ where: { workspaceId: session.workspace.id } })).resolves.toMatchObject({
      summary: "Changed catalogue",
      projectionStatus: "FAILED",
      version: 2
    });
    await expect(prisma.knowledgeVault.count({ where: { workspaceId: session.workspace.id, section: "PRODUCTS", deletedAt: null } })).resolves.toBe(0);

    const retried = await app.inject({ method: "PUT", url: "/v1/onboarding/products", headers, payload: { summary: "Changed catalogue" } });

    expect(retried.statusCode).toBe(200);
    await expect(prisma.offeringCatalog.findUniqueOrThrow({ where: { workspaceId: session.workspace.id } })).resolves.toMatchObject({
      projectionStatus: "READY",
      projectedVersion: 2,
      version: 2
    });
    await expect(prisma.knowledgeVault.count({ where: { workspaceId: session.workspace.id, section: "PRODUCTS", deletedAt: null } })).resolves.toBe(1);

    await app.close();
  });

  it("rejects duplicate offering names after Unicode and case normalization", async () => {
    const app = await buildApp();
    const session = await registerVerifiedUser(app);
    const response = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/products",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        items: [
          { name: "Pearl Blend", currency: "BHD" },
          { name: "  pearl blend  ", currency: "BHD" }
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    await expect(prisma.offeringCatalog.count({ where: { workspaceId: session.workspace.id } })).resolves.toBe(0);

    await app.close();
  });
});

async function registerVerifiedUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `catalog-${randomUUID()}@markos.test`,
      password: "CorrectHorseBattery99!",
      fullName: "Catalogue User",
      workspaceName: `Catalogue Workspace ${randomUUID()}`,
      locale: "en"
    }
  });
  const session = response.json().data;
  await prisma.user.update({ where: { id: session.user.id }, data: { isVerified: true } });
  return session;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { authorization: `Bearer ${accessToken}` };
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
