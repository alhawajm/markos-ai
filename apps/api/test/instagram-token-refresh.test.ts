import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { issueAuthTokens } from "../src/auth/tokens";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { refreshDueInstagramTokens } from "../src/workspace/instagram-token-service";
import { decryptCredential } from "../src/security/credential-encryption";
import { env } from "../src/config/env";
import { persistTestInstagramConnection } from "./helpers/instagram-connection";

describe("Instagram token refresh", () => {
  it("refreshes a connected workspace token on demand", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const accountId = `refresh-${randomUUID()}`;
    const oldToken = `old-token-${randomUUID()}`;
    await persistTestInstagramConnection({
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      accountId,
      accessToken: oldToken,
      expiresAt: new Date(Date.now() + 7 * 86_400_000)
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
    const credential = await prisma.instagramConnectionCredential.findUniqueOrThrow({
      select: {
        encryptedAccessToken: true,
        tokenExpiresAt: true
      },
      where: {
        workspaceId: session.workspace.id
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
    expect(decryptCredential(credential.encryptedAccessToken, env.INSTAGRAM_TOKEN_ENCRYPTION_KEY!)).toBe("new-token");
    expect(credential.tokenExpiresAt.getTime()).toBeGreaterThan(Date.now());

    await app.close();
  });

  it("exposes a workspace token refresh route", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const accountId = `refresh-route-${randomUUID()}`;
    await persistTestInstagramConnection({
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      accountId,
      accessToken: "old-token-route",
      expiresAt: new Date(Date.now() + 7 * 86_400_000)
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
      const credential = await prisma.instagramConnectionCredential.findUniqueOrThrow({
        select: {
          encryptedAccessToken: true
        },
        where: {
          workspaceId: session.workspace.id
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.refreshed).toBe(true);
      expect(response.json().data.connection.accountId).toBe(accountId);
      expect(decryptCredential(credential.encryptedAccessToken, env.INSTAGRAM_TOKEN_ENCRYPTION_KEY!)).toBe("new-token-route");
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

  const session = response.json().data;

  await prisma.user.update({
    data: {
      isVerified: true
    },
    where: {
      id: session.user.id
    }
  });

  const steppedUpTokens = await issueAuthTokens({
    mfaVerified: true,
    roles: ["OWNER"],
    userId: session.user.id,
    workspaceId: session.workspace.id
  });

  return {
    ...session,
    mfaVerified: true,
    tokens: {
      ...session.tokens,
      accessToken: steppedUpTokens.accessToken
    },
    user: {
      ...session.user,
      isVerified: true
    }
  };
}

function jsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status: 200
  });
}
