import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { searchVaultContext } from "../src/vault/vault-service";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Vault website ingest local flow", () => {
  it("approves website facts and makes them searchable when the local AI embedding service is offline", async () => {
    const app = await buildApp();
    const session = await registerVerifiedTestUser(app);
    const sourceUrl = "https://local-flow.example/";
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = requestUrl(input);

      if (url.includes("/ai/vault/embed")) {
        return new Response("offline", { status: 503 });
      }

      if (url === sourceUrl) {
        return new Response(
          `
            <!doctype html>
            <html>
              <head>
                <title>Local Flow Jewelry | Bahrain</title>
                <meta name="description" content="Premium bridal jewelry and custom gift packages in Bahrain." />
              </head>
              <body>
                <h1>Luxury Bridal Jewelry Services</h1>
                <p>Our premium service helps modern Bahrain customers choose handcrafted rings and gifts.</p>
                <a href="/collections">Shop bridal collection</a>
              </body>
            </html>
          `,
          {
            headers: {
              "content-type": "text/html; charset=utf-8"
            },
            status: 200
          }
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const preview = await app.inject({
      method: "POST",
      url: "/v1/vault/ingest/website/preview",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        url: sourceUrl
      }
    });
    const draftId = preview.json().data.id;
    const approve = await app.inject({
      method: "POST",
      url: `/v1/vault/ingest/${draftId}/approve`,
      headers: authHeaders(session.tokens.accessToken),
      payload: {}
    });

    expect(approve.statusCode).toBe(200);
    expect(approve.json().data.status).toBe("APPROVED");

    const entries = await prisma.knowledgeVault.findMany({
      where: {
        workspaceId: session.workspace.id,
        deletedAt: null
      }
    });
    const results = await searchVaultContext(session.workspace.id, {
      query: "bridal jewelry Bahrain gift packages",
      topK: 3
    });

    expect(entries.length).toBeGreaterThan(0);
    expect(results.length).toBeGreaterThan(0);
    expect(results.map((result) => result.section)).toContain("PRODUCTS");
    expect(results[0]?.value).toEqual(expect.any(Object));
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("/ai/vault/embed"))).toBe(true);

    await app.close();
  });
});

async function registerVerifiedTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = `vault-local-flow-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password: "CorrectHorseBattery99!",
      fullName: "Vault Local Flow User",
      workspaceName: `Vault Local Flow Workspace ${randomUUID()}`,
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

type FetchInput = Parameters<typeof fetch>[0];

function requestUrl(input: FetchInput): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}
