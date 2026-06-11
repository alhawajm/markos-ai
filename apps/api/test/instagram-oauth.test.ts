import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import {
  completeInstagramOAuth,
  createInstagramOAuthStart,
  type InstagramOAuthConfig
} from "../src/workspace/instagram-oauth-service";

const oauthConfig: InstagramOAuthConfig = {
  appId: "instagram-app-id",
  appSecret: "instagram-app-secret",
  authorizeUrl: "https://www.instagram.com/oauth/authorize",
  jwtSecret: "test-oauth-secret-change-me",
  longLivedTokenUrl: "https://graph.instagram.com/access_token",
  redirectUri: "http://localhost:4000/v1/workspace/instagram/oauth/callback",
  scopes: "instagram_business_basic,instagram_business_content_publish",
  tokenUrl: "https://api.instagram.com/oauth/access_token"
};

describe("Instagram OAuth", () => {
  it("builds an Instagram authorization URL with signed state", async () => {
    const start = await createInstagramOAuthStart({
      config: oauthConfig,
      locale: "ar",
      userId: randomUUID(),
      workspaceId: randomUUID()
    });
    const url = new URL(start.authorizationUrl);

    expect(url.origin + url.pathname).toBe(oauthConfig.authorizeUrl);
    expect(url.searchParams.get("client_id")).toBe(oauthConfig.appId);
    expect(url.searchParams.get("redirect_uri")).toBe(oauthConfig.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe(oauthConfig.scopes);
    expect(url.searchParams.get("state")).toMatch(/\S+\.\S+\.\S+/);
    expect(new Date(start.stateExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("exchanges the callback code and stores the long-lived token", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const start = await createInstagramOAuthStart({
      config: oauthConfig,
      userId: session.user.id,
      workspaceId: session.workspace.id
    });
    const state = new URL(start.authorizationUrl).searchParams.get("state");
    const calls: Array<{ input: string; body?: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({
        input: String(input),
        ...(init?.body === undefined || init.body === null ? {} : { body: init.body.toString() })
      });

      if (String(input) === oauthConfig.tokenUrl) {
        return jsonResponse({
          access_token: "short-lived-token",
          user_id: "17841400000000000"
        });
      }

      return jsonResponse({
        access_token: "long-lived-token",
        expires_in: 60 * 24 * 60 * 60
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
        id: session.workspace.id
      },
      select: {
        instagramAccessToken: true,
        instagramAccountId: true,
        instagramTokenExpiresAt: true
      }
    });

    expect(result.connection).toMatchObject({
      accountId: "17841400000000000",
      connected: true
    });
    expect(workspace.instagramAccountId).toBe("17841400000000000");
    expect(workspace.instagramAccessToken).toBe("long-lived-token");
    expect(workspace.instagramTokenExpiresAt?.getTime()).toBeGreaterThan(Date.now());
    expect(calls).toHaveLength(2);
    expect(calls[0]?.body).toContain("grant_type=authorization_code");
    expect(calls[0]?.body).toContain("code=callback-code");
    expect(calls[1]?.input).toContain("grant_type=ig_exchange_token");
    expect(calls[1]?.input).toContain("access_token=short-lived-token");

    await app.close();
  });
});

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = `instagram-oauth-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    payload: {
      email,
      fullName: "Instagram OAuth User",
      locale: "en",
      password: "CorrectHorseBattery99!",
      workspaceName: `Instagram OAuth ${randomUUID()}`
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
