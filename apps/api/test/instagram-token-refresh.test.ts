import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { refreshDueInstagramTokens } from "../src/workspace/instagram-token-service";

describe("Instagram token refresh", () => {
  it("refreshes a connected workspace token on demand", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const accountId = `refresh-${randomUUID()}`;
    const oldToken = `old-token-${randomUUID()}`;
    await prisma.workspace.update({
      data: {
        instagramAccessToken: oldToken,
        instagramAccountId: accountId,
        instagramTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      },
      where: {
        id: session.workspace.id
      }
    });
    const calls: string[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      calls.push(String(input));
      return jsonResponse({
        access_token: "new-token",
        expires_in: 60 * 24 * 60 * 60
      });
    };

    const result = await refreshDueInstagramTokens({
      fetchImpl,
      now: new Date()
    });
    const workspace = await prisma.workspace.findUniqueOrThrow({
      select: {
        instagramAccessToken: true,
        instagramTokenExpiresAt: true
      },
      where: {
        id: session.workspace.id
      }
    });

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          refreshed: true,
          workspaceId: session.workspace.id
        })
      ])
    );
    expect(calls[0]).toContain("grant_type=ig_refresh_token");
    expect(calls).toEqual(expect.arrayContaining([expect.stringContaining(`access_token=${oldToken}`)]));
    expect(workspace.instagramAccessToken).toBe("new-token");
    expect(workspace.instagramTokenExpiresAt?.getTime()).toBeGreaterThan(Date.now());

    await app.close();
  });

  it("exposes a workspace token refresh route", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const accountId = `refresh-route-${randomUUID()}`;
    await prisma.workspace.update({
      data: {
        instagramAccessToken: "old-token-route",
        instagramAccountId: accountId,
        instagramTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      },
      where: {
        id: session.workspace.id
      }
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      jsonResponse({
        access_token: "new-token-route",
        expires_in: 60 * 24 * 60 * 60
      })) as typeof fetch;

    try {
      const response = await app.inject({
        headers: {
          authorization: `Bearer ${session.tokens.accessToken}`
        },
        method: "POST",
        url: "/v1/workspace/instagram/refresh"
      });
      const workspace = await prisma.workspace.findUniqueOrThrow({
        select: {
          instagramAccessToken: true
        },
        where: {
          id: session.workspace.id
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.refreshed).toBe(true);
      expect(response.json().data.connection.accountId).toBe(accountId);
      expect(workspace.instagramAccessToken).toBe("new-token-route");
      await expect(
        prisma.auditLog.findFirstOrThrow({
          where: {
            action: "INSTAGRAM_TOKEN_REFRESHED",
            actorId: session.user.id,
            targetId: accountId,
            workspaceId: session.workspace.id
          }
        })
      ).resolves.toMatchObject({
        targetType: "InstagramConnection"
      });
    } finally {
      globalThis.fetch = originalFetch;
      await app.close();
    }
  });
});

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = `instagram-refresh-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    payload: {
      email,
      fullName: "Instagram Refresh User",
      locale: "en",
      password: "CorrectHorseBattery99!",
      workspaceName: `Instagram Refresh ${randomUUID()}`
    },
    url: "/v1/auth/register"
  });

  return response.json().data;
}

function jsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status: 200
  });
}
