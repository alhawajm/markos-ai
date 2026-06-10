import { randomUUID } from "node:crypto";
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

vi.mock("../src/ai/content-client", () => ({
  generateContentDrafts: async (input: { contentType: string; count: number; topic: string }) => ({
    model: "test-content-model",
    prompt_version: "content.v1.test",
    tokens_in: 55,
    tokens_out: 89,
    drafts: Array.from({ length: input.count }, (_, index) => ({
      contentType: input.contentType,
      captionEn: `English caption ${index + 1} for ${input.topic}`,
      captionAr: `Arabic caption ${index + 1} for ${input.topic}`,
      hashtags: ["#BahrainBusiness", "#MarkosAI"],
      callToAction: "Send a DM.",
      contentPillar: "Proof and trust",
      ...(input.contentType === "CAROUSEL" ? { carousel: { slides: [{ title: "Hook" }] } } : {})
    }))
  })
}));

describe("content routes", () => {
  it("requires Vault context before generating content", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const response = await app.inject({
      method: "POST",
      url: "/v1/content/generate",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        topic: "wholesale coffee leads",
        contentType: "POST",
        count: 1
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: "CONTENT_CONTEXT_MISSING"
      }
    });

    await app.close();
  });

  it("generates Vault-grounded draft content and meters the interaction", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    await app.inject({
      method: "PUT",
      url: "/v1/vault/company",
      headers,
      payload: {
        entries: [
          {
            key: "profile",
            value: {
              name: "Pearl Coffee",
              industry: "specialty coffee",
              location: "Manama, Bahrain"
            }
          }
        ]
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/content/generate",
      headers,
      payload: {
        topic: "wholesale coffee leads",
        contentType: "CAROUSEL",
        count: 2
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [
        {
          workspaceId: session.workspace.id,
          contentType: "CAROUSEL",
          status: "DRAFT",
          captionEn: "English caption 1 for wholesale coffee leads",
          captionAr: "Arabic caption 1 for wholesale coffee leads",
          hashtags: ["#BahrainBusiness", "#MarkosAI"],
          callToAction: "Send a DM.",
          contentPillar: "Proof and trust",
          carousel: {
            slides: [
              {
                title: "Hook"
              }
            ]
          }
        },
        {
          workspaceId: session.workspace.id,
          contentType: "CAROUSEL",
          status: "DRAFT"
        }
      ]
    });

    const interaction = await prisma.aiInteraction.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id,
        agent: "CONTENT"
      }
    });
    const list = await app.inject({
      method: "GET",
      url: "/v1/content",
      headers
    });

    expect(interaction).toMatchObject({
      promptVersion: "content.v1.test",
      tokensIn: 55,
      tokensOut: 89,
      costMinor: 0,
      currency: "BHD",
      model: "test-content-model"
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(2);

    await app.close();
  });
});

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = `content-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password: "CorrectHorseBattery99!",
      fullName: "Content User",
      workspaceName: `Content Workspace ${randomUUID()}`,
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

function testEmbedding(text: string): number[] {
  const vector = Array.from({ length: 1536 }, () => 0);

  for (const token of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    const index = token.charCodeAt(0) % vector.length;
    vector[index] = (vector[index] ?? 0) + 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  return norm === 0 ? vector : vector.map((value) => value / norm);
}
