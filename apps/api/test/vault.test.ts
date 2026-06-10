import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/http/app";

vi.mock("../src/ai/embeddings-client", () => ({
  embedVaultTexts: async (texts: string[]) => ({
    model: "test-embedding-model",
    dimensions: 1536,
    embeddings: texts.map(testEmbedding)
  })
}));

describe("vault routes", () => {
  it("upserts section entries, versions edits, scores completeness, and retrieves RAG context", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    const initialScore = await app.inject({
      method: "GET",
      url: "/v1/vault/score",
      headers
    });

    expect(initialScore.statusCode).toBe(200);
    expect(initialScore.json()).toMatchObject({
      data: {
        score: 0,
        completedSections: [],
        entryCount: 0
      }
    });

    const createResponse = await app.inject({
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
              location: "Bahrain"
            }
          }
        ]
      }
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toMatchObject({
      data: [
        {
          workspaceId: session.workspace.id,
          section: "COMPANY",
          key: "profile",
          version: 1,
          value: {
            name: "Pearl Coffee"
          }
        }
      ]
    });

    const updateResponse = await app.inject({
      method: "PUT",
      url: "/v1/vault/COMPANY",
      headers,
      payload: {
        entries: [
          {
            key: "profile",
            value: {
              name: "Pearl Coffee Roasters",
              industry: "specialty coffee",
              location: "Manama, Bahrain"
            }
          }
        ]
      }
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().data[0]).toMatchObject({
      key: "profile",
      version: 2,
      value: {
        name: "Pearl Coffee Roasters"
      }
    });

    const sectionResponse = await app.inject({
      method: "GET",
      url: "/v1/vault/company",
      headers
    });

    expect(sectionResponse.statusCode).toBe(200);
    expect(sectionResponse.json().data).toHaveLength(1);
    expect(sectionResponse.json().data[0]).toMatchObject({
      section: "COMPANY",
      version: 2
    });

    const scoreResponse = await app.inject({
      method: "GET",
      url: "/v1/vault/score",
      headers
    });

    expect(scoreResponse.statusCode).toBe(200);
    expect(scoreResponse.json()).toMatchObject({
      data: {
        score: 13,
        completedSections: ["COMPANY"],
        missingSections: expect.arrayContaining(["STORY", "PRODUCTS"]),
        entryCount: 1
      }
    });

    const searchResponse = await app.inject({
      method: "POST",
      url: "/v1/vault/rag/search",
      headers,
      payload: {
        query: "coffee Bahrain",
        topK: 3
      }
    });

    expect(searchResponse.statusCode).toBe(200);
    expect(searchResponse.json().data[0]).toMatchObject({
      section: "COMPANY",
      key: "profile"
    });
    expect(searchResponse.json().data[0].score).toEqual(expect.any(Number));

    await app.close();
  });

  it("scopes Vault reads and RAG search to the authenticated workspace", async () => {
    const app = await buildApp();
    const first = await registerTestUser(app);
    const second = await registerTestUser(app);

    await app.inject({
      method: "PUT",
      url: "/v1/vault/company",
      headers: authHeaders(first.tokens.accessToken),
      payload: {
        entries: [{ key: "profile", value: { name: "First Coffee", location: "Bahrain" } }]
      }
    });
    await app.inject({
      method: "PUT",
      url: "/v1/vault/company",
      headers: authHeaders(second.tokens.accessToken),
      payload: {
        entries: [{ key: "profile", value: { name: "Second Bakery", location: "Bahrain" } }]
      }
    });

    const firstVault = await app.inject({
      method: "GET",
      url: "/v1/vault/company",
      headers: authHeaders(first.tokens.accessToken)
    });
    const secondSearch = await app.inject({
      method: "POST",
      url: "/v1/vault/rag/search",
      headers: authHeaders(second.tokens.accessToken),
      payload: {
        query: "bakery Bahrain",
        topK: 10
      }
    });

    expect(firstVault.json().data).toEqual([
      expect.objectContaining({
        workspaceId: first.workspace.id,
        value: expect.objectContaining({ name: "First Coffee" })
      })
    ]);
    expect(firstVault.json().data).not.toEqual([
      expect.objectContaining({
        workspaceId: second.workspace.id
      })
    ]);
    expect(secondSearch.json().data).toEqual([
      expect.objectContaining({
        key: "profile",
        value: expect.objectContaining({ name: "Second Bakery" })
      })
    ]);

    await app.close();
  });

  it("requires authentication for Vault endpoints", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/vault"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: "AUTH_REQUIRED"
      }
    });

    await app.close();
  });
});

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = `vault-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password: "CorrectHorseBattery99!",
      fullName: "Vault User",
      workspaceName: `Vault Workspace ${randomUUID()}`,
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
