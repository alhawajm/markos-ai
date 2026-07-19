import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

vi.mock("../src/ai/embeddings-client", () => ({
  embedVaultTexts: async (texts: string[]) => ({
    model: "test-embedding-model",
    dimensions: 1536,
    embeddings: texts.map(testEmbedding)
  })
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Vault website ingest routes", () => {
  it("previews website signals, approves them into the Vault, and records audit evidence", async () => {
    const app = await buildApp();
    const session = await registerVerifiedTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const sourceUrl = "https://raedat.example/";

    mockWebsiteFetch(sourceUrl, `
      <!doctype html>
      <html>
        <head>
          <title>Raedat Jewelry | Luxury Bahrain Collections</title>
          <meta name="description" content="Luxury jewelry collections crafted for modern women in Bahrain." />
          <meta property="og:site_name" content="Raedat Jewelry" />
        </head>
        <body style="--brand:#78DAD1; color:#F2C84B">
          <h1>Luxury Jewelry Collection Launch</h1>
          <p>Our premium handcrafted jewelry celebrates elegance, heritage, and meticulous craftsmanship.</p>
          <p>Shop our bridal collection, custom pieces, and gift packages online.</p>
          <a href="/collections">Shop collections</a>
          <a href="/services">Jewelry services</a>
          <img src="/ring.jpg" alt="Gold ring with pearl detail" />
        </body>
      </html>
    `);

    const preview = await app.inject({
      method: "POST",
      url: "/v1/vault/ingest/website/preview",
      headers,
      payload: {
        url: sourceUrl
      }
    });

    expect(preview.statusCode).toBe(200);
    expect(preview.json().data).toMatchObject({
      workspaceId: session.workspace.id,
      sourceUrl,
      status: "PENDING",
      sourceTitle: "Raedat Jewelry | Luxury Bahrain Collections"
    });
    expect(preview.json().data.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ section: "COMPANY", key: "website-profile" }),
        expect.objectContaining({ section: "STORY", key: "website-story" }),
        expect.objectContaining({ section: "PRODUCTS", key: "website-products" }),
        expect.objectContaining({ section: "BRAND", key: "website-visual-signals" }),
        expect.objectContaining({ section: "TONE", key: "website-voice" })
      ])
    );

    const draftId = preview.json().data.id;
    const approve = await app.inject({
      method: "POST",
      url: `/v1/vault/ingest/${draftId}/approve`,
      headers,
      payload: {}
    });

    expect(approve.statusCode).toBe(200);
    expect(approve.json().data).toMatchObject({
      id: draftId,
      status: "APPROVED"
    });

    const entries = await prisma.knowledgeVault.findMany({
      where: {
        workspaceId: session.workspace.id,
        key: {
          in: ["website-profile", "website-story", "website-products", "website-visual-signals", "website-voice"]
        }
      },
      orderBy: {
        key: "asc"
      }
    });

    expect(entries).toHaveLength(5);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section: "COMPANY",
          value: expect.objectContaining({
            name: "Raedat Jewelry"
          })
        }),
        expect.objectContaining({
          section: "PRODUCTS",
          value: expect.objectContaining({
            discoveredItems: expect.arrayContaining([
              expect.objectContaining({
                name: expect.stringContaining("Shop")
              })
            ])
          })
        })
      ])
    );

    const auditActions = await prisma.auditLog.findMany({
      where: {
        workspaceId: session.workspace.id,
        targetId: draftId
      },
      select: {
        action: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    expect(auditActions.map((entry) => entry.action)).toEqual([
      "VAULT_WEBSITE_INGEST_PREVIEWED",
      "VAULT_WEBSITE_INGEST_APPROVED"
    ]);

    const approveAgain = await app.inject({
      method: "POST",
      url: `/v1/vault/ingest/${draftId}/approve`,
      headers,
      payload: {}
    });

    expect(approveAgain.statusCode).toBe(409);
    expect(approveAgain.json()).toMatchObject({
      error: {
        code: "WEBSITE_INGEST_DRAFT_LOCKED"
      }
    });

    await app.close();
  });

  it("rejects a preview without writing Vault entries", async () => {
    const app = await buildApp();
    const session = await registerVerifiedTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    mockWebsiteFetch("https://reject.example/", `
      <html>
        <head><title>Reject Me</title></head>
        <body>
          <h1>Experimental campaign landing page</h1>
          <p>This page should not be used as business memory.</p>
        </body>
      </html>
    `);

    const preview = await app.inject({
      method: "POST",
      url: "/v1/vault/ingest/website/preview",
      headers,
      payload: {
        url: "https://reject.example/"
      }
    });
    const draftId = preview.json().data.id;
    const reject = await app.inject({
      method: "POST",
      url: `/v1/vault/ingest/${draftId}/reject`,
      headers,
      payload: {
        reason: "Wrong source"
      }
    });

    expect(reject.statusCode).toBe(200);
    expect(reject.json().data).toMatchObject({
      id: draftId,
      status: "REJECTED",
      error: "Wrong source"
    });

    const entries = await prisma.knowledgeVault.findMany({
      where: {
        workspaceId: session.workspace.id,
        key: {
          startsWith: "website-"
        }
      }
    });

    expect(entries).toHaveLength(0);

    await app.close();
  });

  it("blocks local URLs before fetching", async () => {
    const app = await buildApp();
    const session = await registerVerifiedTestUser(app);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.inject({
      method: "POST",
      url: "/v1/vault/ingest/website/preview",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        url: "http://localhost:3000"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "WEBSITE_INGEST_URL_BLOCKED"
      }
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await app.close();
  });

  it("keeps website ingest drafts scoped to the authenticated workspace", async () => {
    const app = await buildApp();
    const first = await registerVerifiedTestUser(app);
    const second = await registerVerifiedTestUser(app);

    mockWebsiteFetch("https://scope.example/", `
      <html>
        <head><title>Scoped Brand</title><meta name="description" content="Scoped brand context" /></head>
        <body><h1>Scoped Campaign</h1><p>Scoped service package for Bahrain businesses.</p></body>
      </html>
    `);

    const preview = await app.inject({
      method: "POST",
      url: "/v1/vault/ingest/website/preview",
      headers: authHeaders(first.tokens.accessToken),
      payload: {
        url: "https://scope.example/"
      }
    });
    const draftId = preview.json().data.id;

    const crossWorkspaceApprove = await app.inject({
      method: "POST",
      url: `/v1/vault/ingest/${draftId}/approve`,
      headers: authHeaders(second.tokens.accessToken),
      payload: {}
    });

    expect(crossWorkspaceApprove.statusCode).toBe(404);
    expect(crossWorkspaceApprove.json()).toMatchObject({
      error: {
        code: "WEBSITE_INGEST_DRAFT_NOT_FOUND"
      }
    });

    const secondEntries = await prisma.knowledgeVault.findMany({
      where: {
        workspaceId: second.workspace.id
      }
    });

    expect(secondEntries).toHaveLength(0);

    await app.close();
  });
});

function mockWebsiteFetch(url: string, html: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(new TextEncoder().encode(html), {
        headers: {
          "content-type": "text/html; charset=utf-8"
        },
        status: 200
      });
    })
  );
}

async function registerVerifiedTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = `vault-ingest-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password: "CorrectHorseBattery99!",
      fullName: "Vault Ingest User",
      workspaceName: `Vault Ingest Workspace ${randomUUID()}`,
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

function testEmbedding(text: string): number[] {
  const vector = Array.from({ length: 1536 }, () => 0);

  for (const token of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    const index = token.charCodeAt(0) % vector.length;
    vector[index] = (vector[index] ?? 0) + 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  return norm === 0 ? vector : vector.map((value) => value / norm);
}
