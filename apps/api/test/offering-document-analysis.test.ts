import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiServiceRequestError } from "../src/ai/request";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

const aiHarness = vi.hoisted(() => ({
  analyze: vi.fn()
}));

const storageHarness = vi.hoisted(() => ({
  nextId: 0,
  objects: new Map<string, Buffer>(),
  read: vi.fn(),
  remove: vi.fn(),
  store: vi.fn()
}));

vi.mock("../src/ai/offering-document-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/ai/offering-document-client")>();
  return {
    ...original,
    analyzeOfferingDocuments: aiHarness.analyze
  };
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
  return {
    ...original,
    deleteStoredMedia: storageHarness.remove,
    readStoredMedia: storageHarness.read,
    storeWorkspaceMedia: storageHarness.store
  };
});

describe("offering document analysis", () => {
  beforeEach(() => {
    aiHarness.analyze.mockReset();
    storageHarness.nextId = 0;
    storageHarness.objects.clear();
    storageHarness.read.mockReset();
    storageHarness.remove.mockReset();
    storageHarness.store.mockReset();

    storageHarness.store.mockImplementation(async (input: { workspaceId: string; filename: string; bytes: Buffer }) => {
      const key = `local:${input.workspaceId}/document-${storageHarness.nextId++}.txt`;
      storageHarness.objects.set(key, input.bytes);
      return {
        key,
        publicUrl: `http://localhost:4000/media/${input.workspaceId}/document.txt`,
        sizeBytes: input.bytes.byteLength
      };
    });
    storageHarness.read.mockImplementation(async (_workspaceId: string, key: string) => {
      const bytes = storageHarness.objects.get(key);
      if (bytes === undefined) throw new Error("missing test document");
      return bytes;
    });
    storageHarness.remove.mockImplementation(async (_workspaceId: string, key: string) => {
      storageHarness.objects.delete(key);
    });
  });

  it("keeps analysis temporary until an edited result is approved into the canonical catalogue", async () => {
    aiHarness.analyze.mockResolvedValue(analysisResponse());
    const app = await buildApp();
    const first = await registerTestUser(app);
    const second = await registerTestUser(app);
    const firstHeaders = authHeaders(first.tokens.accessToken);
    const sourceText = "Espresso: Rich house blend";

    const created = await app.inject({
      method: "POST",
      url: "/v1/onboarding/products/document-analysis",
      headers: firstHeaders,
      payload: {
        files: [
          {
            filename: "offerings.txt",
            mimeType: "text/plain",
            base64Data: Buffer.from(sourceText).toString("base64")
          }
        ]
      }
    });

    expect(created.statusCode).toBe(200);
    expect(created.json().data).toMatchObject({
      status: "READY",
      files: [expect.objectContaining({ filename: "offerings.txt", removed: false })],
      result: {
        catalog: {
          items: [expect.objectContaining({ name: "Espresso" })]
        }
      }
    });
    const analysisId = created.json().data.id as string;
    expect(storageHarness.objects.size).toBe(1);
    await expect(prisma.offeringCatalog.count({ where: { workspaceId: first.workspace.id } })).resolves.toBe(0);
    await expect(prisma.knowledgeVault.count({ where: { workspaceId: first.workspace.id, section: "PRODUCTS", deletedAt: null } })).resolves.toBe(0);

    const crossWorkspaceApproval = await app.inject({
      method: "POST",
      url: `/v1/onboarding/products/document-analysis/${analysisId}/approve`,
      headers: authHeaders(second.tokens.accessToken),
      payload: { catalog: { summary: "Wrong workspace" } }
    });
    expect(crossWorkspaceApproval.statusCode).toBe(404);

    const approvedCatalog = {
      summary: "Coffee and office subscription services.",
      items: [
        {
          kind: "PRODUCT",
          name: "Espresso",
          description: "Rich house espresso blend, confirmed by the owner.",
          currency: "BHD"
        }
      ],
      differentiators: [],
      salesChannels: []
    };
    const approved = await app.inject({
      method: "POST",
      url: `/v1/onboarding/products/document-analysis/${analysisId}/approve`,
      headers: firstHeaders,
      payload: { catalog: approvedCatalog }
    });

    expect(approved.statusCode).toBe(200);
    expect(approved.json().data.analysis).toMatchObject({
      id: analysisId,
      status: "APPROVED",
      files: [expect.objectContaining({ removed: true })]
    });
    expect(storageHarness.objects.size).toBe(0);

    const [offering, revision, interaction, file] = await Promise.all([
      prisma.offering.findFirstOrThrow({ where: { workspaceId: first.workspace.id, deletedAt: null } }),
      prisma.offeringCatalogRevision.findFirstOrThrow({ where: { workspaceId: first.workspace.id } }),
      prisma.aiInteraction.findFirstOrThrow({ where: { workspaceId: first.workspace.id, agent: "OFFERING_DOCUMENT_RESOLVER" } }),
      prisma.offeringDocumentFile.findFirstOrThrow({ where: { workspaceId: first.workspace.id, analysisId } })
    ]);

    expect(offering).toMatchObject({
      name: "Espresso",
      description: "Rich house espresso blend, confirmed by the owner.",
      sourceType: "DOCUMENT",
      sourceRef: analysisId
    });
    expect(revision).toMatchObject({ sourceType: "DOCUMENT", sourceRef: analysisId });
    expect(interaction).toMatchObject({ accepted: true, edited: true });
    expect(JSON.stringify(interaction.prompt)).not.toContain(sourceText);
    expect(JSON.stringify(interaction.prompt)).not.toContain(Buffer.from(sourceText).toString("base64"));
    expect(interaction.response).toMatchObject({ approvedCatalog });
    expect(file).toMatchObject({ storageKey: null, removedAt: expect.any(Date) });

    const active = await app.inject({
      method: "GET",
      url: "/v1/onboarding/products/document-analysis",
      headers: firstHeaders
    });
    expect(active.statusCode).toBe(200);
    expect(active.json().data).toBeNull();

    await app.close();
  });

  it("supports retrying a failed analysis and discarding the temporary result", async () => {
    aiHarness.analyze
      .mockRejectedValueOnce(
        new AiServiceRequestError({
          code: "AI_PROVIDER_NOT_CONFIGURED",
          message: "The AI provider is not configured",
          retryable: false,
          statusCode: 503
        })
      )
      .mockResolvedValueOnce(analysisResponse());
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    const created = await uploadTextDocument(app, headers);
    expect(created.statusCode).toBe(200);
    expect(created.json().data).toMatchObject({
      status: "FAILED",
      failureCode: "AI_PROVIDER_NOT_CONFIGURED"
    });
    const analysisId = created.json().data.id as string;

    const duplicate = await uploadTextDocument(app, headers);
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe("OFFERING_DOCUMENT_ANALYSIS_CONFLICT");

    const retried = await app.inject({
      method: "POST",
      url: `/v1/onboarding/products/document-analysis/${analysisId}/retry`,
      headers
    });
    expect(retried.statusCode).toBe(200);
    expect(retried.json().data.status).toBe("READY");

    const discarded = await app.inject({
      method: "DELETE",
      url: `/v1/onboarding/products/document-analysis/${analysisId}`,
      headers
    });
    expect(discarded.statusCode).toBe(200);
    expect(discarded.json().data).toMatchObject({
      status: "DISCARDED",
      files: [expect.objectContaining({ removed: true })]
    });
    expect(storageHarness.objects.size).toBe(0);
    await expect(prisma.offeringCatalog.count({ where: { workspaceId: session.workspace.id } })).resolves.toBe(0);

    await app.close();
  });

  it("rejects mismatched file signatures before temporary storage", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const response = await app.inject({
      method: "POST",
      url: "/v1/onboarding/products/document-analysis",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        files: [
          {
            filename: "not-a-pdf.pdf",
            mimeType: "application/pdf",
            base64Data: Buffer.from("not a PDF").toString("base64")
          }
        ]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("OFFERING_DOCUMENT_INVALID");
    expect(storageHarness.store).not.toHaveBeenCalled();
    await app.close();
  });

  it("recovers an interrupted processing state so the user is not blocked for 24 hours", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const analysis = await prisma.offeringDocumentAnalysis.create({
      data: {
        workspaceId: session.workspace.id,
        status: "PROCESSING",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 4 * 60 * 1000)
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/onboarding/products/document-analysis",
      headers: authHeaders(session.tokens.accessToken)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      id: analysis.id,
      status: "FAILED",
      failureCode: "OFFERING_DOCUMENT_ANALYSIS_INTERRUPTED"
    });
    await app.close();
  });
});

function analysisResponse() {
  return {
    model: "test-document-model",
    prompt_version: "onboarding-offering-document.v1.test",
    tokens_in: 80,
    tokens_out: 120,
    extraction: {
      catalog: {
        summary: "Coffee products.",
        items: [
          {
            kind: "PRODUCT",
            name: "Espresso",
            description: "Rich house blend.",
            currency: "BHD",
            confidence: "MEDIUM",
            sourceFiles: ["offerings.txt"]
          }
        ],
        differentiators: [],
        salesChannels: []
      },
      issues: [
        {
          code: "REVIEW_REQUIRED",
          severity: "INFO",
          message: "Review the extracted offering.",
          sourceFiles: ["offerings.txt"]
        }
      ]
    }
  };
}

async function uploadTextDocument(app: Awaited<ReturnType<typeof buildApp>>, headers: Record<string, string>) {
  return app.inject({
    method: "POST",
    url: "/v1/onboarding/products/document-analysis",
    headers,
    payload: {
      files: [
        {
          filename: "offerings.txt",
          mimeType: "text/plain",
          base64Data: Buffer.from("Espresso: Rich house blend").toString("base64")
        }
      ]
    }
  });
}

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `offering-documents-${randomUUID()}@markos.test`,
      password: "CorrectHorseBattery99!",
      fullName: "Offering Document User",
      workspaceName: `Offering Document Workspace ${randomUUID()}`,
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
