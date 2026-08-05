import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { InstagramBasicClient } from "../src/workspace/instagram-basic-client";
import {
  completeInstagramOAuth,
  createInstagramOAuthStart,
  type InstagramOAuthConfig
} from "../src/workspace/instagram-oauth-service";

const oauthConfig: InstagramOAuthConfig = {
  appId: "instagram-app-id",
  appSecret: "instagram-app-secret",
  redirectUri: "http://localhost:4000/v1/workspace/instagram/oauth/callback",
  stateSecret: "test-oauth-secret-that-is-at-least-thirty-two-bytes"
};

describe("Instagram OAuth", () => {
  it("builds an Instagram authorization URL with signed state", async () => {
    const workspaceId = randomUUID();
    const start = await createInstagramOAuthStart({
      config: oauthConfig,
      locale: "ar",
      userId: randomUUID(),
      workspaceId
    });
    const url = new URL(start.authorizationUrl);

    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe(oauthConfig.appId);
    expect(url.searchParams.get("redirect_uri")).toBe(oauthConfig.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic");
    expect(url.searchParams.get("enable_fb_login")).toBe("0");
    expect(url.searchParams.get("force_authentication")).toBe("1");
    expect(url.searchParams.get("state")).toMatch(/\S+\.\S+/);
    expect(new Date(start.stateExpiresAt).getTime()).toBeGreaterThan(Date.now());
    await prisma.oAuthStateNonce.deleteMany({ where: { workspaceId } });
  });

  it("exchanges the callback code and stores the long-lived token", async () => {
    const userId = randomUUID();
    const workspaceId = randomUUID();
    await prisma.user.create({ data: { id: userId, email: `${userId}@markos.test`, fullName: "Instagram OAuth User", locale: "EN", isVerified: true } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerUserId: userId, name: `Instagram OAuth ${workspaceId}`, slug: `instagram-oauth-${workspaceId}` } });
    const start = await createInstagramOAuthStart({
      config: oauthConfig,
      userId,
      workspaceId
    });
    const state = new URL(start.authorizationUrl).searchParams.get("state");
    const calls: Array<{ input: string; body?: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({
        input: String(input),
        ...(init?.body === undefined || init.body === null ? {} : { body: init.body.toString() })
      });

      if (String(input) === "https://api.instagram.com/oauth/access_token") {
        return jsonResponse({
          access_token: "short-lived-token",
          user_id: "instagram-scoped-app-user-9001"
        });
      }

      if (String(input).startsWith("https://graph.instagram.com/access_token?"))
        return jsonResponse({
          access_token: "long-lived-token",
          expires_in: 60 * 24 * 60 * 60
        });
      return jsonResponse({
        user_id: "instagram-professional-account-7007",
        username: "markos_business",
        media: { data: [] }
      });
    };

    const result = await completeInstagramOAuth({
      code: "callback-code",
      config: oauthConfig,
      fetchImpl,
      state: state!
    });
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: {
        id: workspaceId
      },
      select: {
        instagramAccessToken: true,
        instagramAccountId: true,
        instagramTokenExpiresAt: true
      }
    });
    const credential = await prisma.instagramConnectionCredential.findUniqueOrThrow({
      where: { workspaceId }
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { workspaceId, action: "INSTAGRAM_CONNECTED" }
    });

    expect(result.connection).toMatchObject({
      accountId: "instagram-professional-account-7007",
      connected: true
    });
    expect(workspace.instagramAccountId).toBeNull();
    expect(workspace.instagramAccessToken).toBeNull();
    expect(workspace.instagramTokenExpiresAt).toBeNull();
    expect(credential.encryptedAccessToken).not.toContain("long-lived-token");
    expect(credential.providerAccountId).toBe("instagram-professional-account-7007");
    expect(audit.targetId).toBe("instagram-professional-account-7007");
    expect(credential.providerConfirmedScopes).toEqual([]);
    expect(calls).toHaveLength(3);
    expect(calls[0]?.body).toContain("grant_type=authorization_code");
    expect(calls[0]?.body).toContain("code=callback-code");
    expect(calls[1]?.input).toContain("grant_type=ig_exchange_token");
    expect(calls[1]?.input).toContain("access_token=short-lived-token");

    await prisma.oAuthStateNonce.deleteMany({ where: { workspaceId } });
    await prisma.auditLog.deleteMany({ where: { workspaceId } });
    await prisma.instagramRecentMedia.deleteMany({ where: { workspaceId } });
    await prisma.instagramConnectionCredential.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });
    await prisma.user.delete({ where: { id: userId } });
  });
});

function jsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status: 200
  });
}
