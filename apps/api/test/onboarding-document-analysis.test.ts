import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

const aiHarness = vi.hoisted(() => ({ analyze: vi.fn() }));
const storageHarness = vi.hoisted(() => ({
  nextId: 0,
  objects: new Map<string, Buffer>(),
  read: vi.fn(),
  remove: vi.fn(),
  store: vi.fn()
}));

vi.mock("../src/ai/onboarding-document-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/ai/onboarding-document-client")>();
  return { ...original, analyzeOnboardingDocuments: aiHarness.analyze };
});

vi.mock("../src/ai/embeddings-client", () => ({
  embedVaultTexts: async (texts: string[]) => ({
    model: "test-embedding-model",
    dimensions: 1536,
    embeddings: texts.map(() => [1, ...Array.from({ length: 1535 }, () => 0)])
  })
}));

vi.mock("../src/media/storage-service", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/media/storage-service")>();
  return { ...original, deleteStoredMedia: storageHarness.remove, readStoredMedia: storageHarness.read, storeWorkspaceMedia: storageHarness.store };
});

describe("full onboarding document analysis", () => {
  beforeEach(() => {
    aiHarness.analyze.mockReset();
    storageHarness.nextId = 0;
    storageHarness.objects.clear();
    storageHarness.read.mockReset();
    storageHarness.remove.mockReset();
    storageHarness.store.mockReset();
    storageHarness.store.mockImplementation(async (input: { workspaceId: string; filename: string; bytes: Buffer }) => {
      const key = `local:${input.workspaceId}/onboarding-${storageHarness.nextId++}`;
      storageHarness.objects.set(key, input.bytes);
      return { key, publicUrl: `http://localhost:4000/media/${input.workspaceId}/${input.filename}`, sizeBytes: input.bytes.byteLength };
    });
    storageHarness.read.mockImplementation(async (_workspaceId: string, key: string) => {
      const bytes = storageHarness.objects.get(key);
      if (!bytes) throw new Error("missing test file");
      return bytes;
    });
    storageHarness.remove.mockImplementation(async (_workspaceId: string, key: string) => {
      storageHarness.objects.delete(key);
    });
  });

  it("keeps a multimodal draft temporary until the owner approves all onboarding sections", async () => {
    aiHarness.analyze.mockResolvedValue(analysisResponse());
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    const created = await app.inject({
      method: "POST",
      url: "/v1/onboarding/document-analysis",
      headers,
      payload: {
        files: [
          {
            filename: "brand.png",
            mimeType: "image/png",
            base64Data: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("test")]).toString("base64")
          }
        ]
      }
    });

    expect(created.statusCode).toBe(200);
    expect(created.json().data).toMatchObject({
      status: "READY",
      files: [expect.objectContaining({ filename: "brand.png", removed: false })],
      result: { profile: { company: { name: "SnackLab" }, brand: { colors: ["#2B59FF"] } } }
    });
    const analysisId = created.json().data.id as string;
    await expect(prisma.knowledgeVault.count({ where: { workspaceId: session.workspace.id, deletedAt: null } })).resolves.toBe(0);
    await expect(prisma.offeringCatalog.count({ where: { workspaceId: session.workspace.id } })).resolves.toBe(0);

    const approved = await app.inject({
      method: "POST",
      url: `/v1/onboarding/document-analysis/${analysisId}/approve`,
      headers,
      payload: {
        profile: {
          company: { name: "SnackLab", industry: "Food and beverage", socials: [], languages: [] },
          offerings: {
            items: [{ kind: "PRODUCT", name: "Protein bites", description: "High-protein snack.", currency: "BHD" }],
            differentiators: [],
            salesChannels: []
          },
          brand: { aestheticWords: [], colors: ["#2B59FF"], fonts: [], toneWords: ["clear"], voiceNotes: "Friendly and factual." }
        }
      }
    });

    expect(approved.statusCode).toBe(200);
    expect(approved.json().data.analysis).toMatchObject({ status: "APPROVED", files: [expect.objectContaining({ removed: true })] });
    expect(approved.json().data.onboarding.readyForProfile).toBe(true);
    expect(storageHarness.objects.size).toBe(0);
    await expect(prisma.offering.findFirst({ where: { workspaceId: session.workspace.id, name: "Protein bites", deletedAt: null } })).resolves.toMatchObject({
      sourceType: "DOCUMENT",
      sourceRef: analysisId
    });
    const brand = await prisma.knowledgeVault.findFirstOrThrow({
      where: { workspaceId: session.workspace.id, section: "BRAND", key: "identity", deletedAt: null }
    });
    expect(brand.value).toMatchObject({ colors: ["#2B59FF"] });
    const interaction = await prisma.aiInteraction.findFirstOrThrow({ where: { workspaceId: session.workspace.id, agent: "ONBOARDING_DOCUMENT_ANALYST" } });
    expect(interaction).toMatchObject({ accepted: true, edited: true });
    await app.close();
  });

  it("keeps failed files retryable and removes them on discard without saving business knowledge", async () => {
    aiHarness.analyze.mockRejectedValueOnce(new Error("provider unavailable")).mockResolvedValueOnce(analysisResponse());
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    const created = await app.inject({
      method: "POST",
      url: "/v1/onboarding/document-analysis",
      headers,
      payload: {
        files: [
          {
            filename: "business.txt",
            mimeType: "text/plain",
            base64Data: Buffer.from("SnackLab business information").toString("base64")
          }
        ]
      }
    });

    expect(created.statusCode).toBe(200);
    expect(created.json().data).toMatchObject({ status: "FAILED", files: [expect.objectContaining({ removed: false })] });
    expect(storageHarness.objects.size).toBe(1);
    const analysisId = created.json().data.id as string;

    const retried = await app.inject({
      method: "POST",
      url: `/v1/onboarding/document-analysis/${analysisId}/retry`,
      headers
    });

    expect(retried.statusCode).toBe(200);
    expect(retried.json().data.status).toBe("READY");

    const discarded = await app.inject({
      method: "DELETE",
      url: `/v1/onboarding/document-analysis/${analysisId}`,
      headers
    });

    expect(discarded.statusCode).toBe(200);
    expect(discarded.json().data).toMatchObject({ status: "DISCARDED", files: [expect.objectContaining({ removed: true })] });
    expect(storageHarness.objects.size).toBe(0);
    await expect(prisma.knowledgeVault.count({ where: { workspaceId: session.workspace.id, deletedAt: null } })).resolves.toBe(0);
    await expect(prisma.offeringCatalog.count({ where: { workspaceId: session.workspace.id } })).resolves.toBe(0);
    await app.close();
  });

  it("rejects an image whose declared type does not match its signature", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const response = await app.inject({
      method: "POST",
      url: "/v1/onboarding/document-analysis",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        files: [{ filename: "fake.png", mimeType: "image/png", base64Data: Buffer.from("not a png").toString("base64") }]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("ONBOARDING_DOCUMENT_INVALID");
    expect(storageHarness.store).not.toHaveBeenCalled();
    await app.close();
  });
});

function analysisResponse() {
  return {
    model: "test-document-model",
    prompt_version: "onboarding-business-documents.v1.test",
    tokens_in: 200,
    tokens_out: 180,
    extraction: {
      profile: {
        company: { name: "SnackLab", industry: "Food and beverage", socials: [], languages: [] },
        offerings: {
          items: [
            {
              kind: "PRODUCT",
              name: "Protein bites",
              description: "High-protein snack.",
              currency: "BHD",
              confidence: "HIGH",
              sourceFiles: ["brand.png"]
            }
          ],
          differentiators: [],
          salesChannels: []
        },
        story: { values: [] },
        audience: { interests: [], locations: [], motivations: [], painPoints: [] },
        competitors: { items: [] },
        brand: { aestheticWords: [], colors: ["#2B59FF"], fonts: [], toneWords: [] },
        objectives: { goals: [] }
      },
      evidence: [{ field: "brand.colors", sourceFiles: ["brand.png"], confidence: "MEDIUM", basis: "VISUAL_INFERENCE" }],
      issues: [{ code: "VISUAL_INFERENCE", severity: "INFO", message: "Confirm the inferred brand color.", field: "brand.colors", sourceFiles: ["brand.png"] }]
    }
  };
}

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `onboarding-documents-${randomUUID()}@markos.test`,
      password: "CorrectHorseBattery99!",
      fullName: "Onboarding Document User",
      workspaceName: `Onboarding Document Workspace ${randomUUID()}`,
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
