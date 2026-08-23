import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { env } from "../src/config/env";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { issueOAuthState } from "../src/security/oauth-state";
import { createPrismaOAuthStateStore } from "../src/security/prisma-oauth-state-store";
import { describeInstagramDatabase } from "./helpers/instagram-database";

describeInstagramDatabase("registered Instagram routes", () => {
  const workspaceIds: string[] = [];
  const userIds: string[] = [];
  let app: Awaited<ReturnType<typeof buildApp>>;
  let originalFetch: typeof fetch;
  let providerCalls = 0;
  const originalOAuthConfig = {
    appId: env.INSTAGRAM_APP_ID,
    appSecret: env.INSTAGRAM_APP_SECRET,
    redirectUri: env.INSTAGRAM_OAUTH_REDIRECT_URI,
    stateSecret: env.INSTAGRAM_OAUTH_STATE_SECRET
  };

  beforeAll(async () => {
    env.INSTAGRAM_APP_ID = "test-instagram-app-id";
    env.INSTAGRAM_APP_SECRET = "test-instagram-app-secret";
    env.INSTAGRAM_OAUTH_REDIRECT_URI = "https://api.example.test/v1/workspace/instagram/oauth/callback";
    env.INSTAGRAM_OAUTH_STATE_SECRET = "test-instagram-state-secret-at-least-32-bytes";
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      providerCalls += 1;
      const url = String(input);
      if (url === "https://api.instagram.com/oauth/access_token") return response({ access_token: "fake-short-token", user_id: "route-scoped-user" });
      if (url.startsWith("https://graph.instagram.com/access_token?")) return response({ access_token: "fake-long-token", expires_in: 5_184_000 });
      if (url.startsWith("https://graph.instagram.com/v25.0/me?"))
        return response({ user_id: "route-professional-account", username: "route_business", media: { data: [] } });
      throw new Error("Unexpected provider request");
    };
    app = await buildApp();
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    env.INSTAGRAM_APP_ID = originalOAuthConfig.appId;
    env.INSTAGRAM_APP_SECRET = originalOAuthConfig.appSecret;
    env.INSTAGRAM_OAUTH_REDIRECT_URI = originalOAuthConfig.redirectUri;
    env.INSTAGRAM_OAUTH_STATE_SECRET = originalOAuthConfig.stateSecret;
    await app.close();
    await prisma.oAuthStateNonce.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.auditLog.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.instagramRecentMedia.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.instagramConnectionCredential.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.workspaceMember.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("authorizes start and fixes the provider contract regardless of caller fields", async () => {
    const owner = await principal("OWNER");
    const editor = await member(owner.workspaceId, "EDITOR");
    const outsider = await principal("OWNER");

    const unauthenticated = await app.inject({ method: "POST", url: "/v1/workspace/instagram/oauth/start" });
    expect(unauthenticated.statusCode).toBe(401);
    const forbidden = await app.inject({ method: "POST", url: "/v1/workspace/instagram/oauth/start", headers: auth(editor.token) });
    expect(forbidden.statusCode).toBe(403);
    const nonmember = await app.inject({
      method: "POST",
      url: "/v1/workspace/instagram/oauth/start",
      headers: auth(await token(outsider.userId, owner.workspaceId))
    });
    expect(nonmember.statusCode).toBe(403);

    const started = await app.inject({
      method: "POST",
      url: "/v1/workspace/instagram/oauth/start",
      headers: auth(owner.token),
      payload: {
        locale: "en",
        returnTo: "/en/app/settings",
        providerHost: "https://untrusted.invalid",
        redirectUri: "https://untrusted.invalid/callback",
        scope: "unrequested_scope"
      }
    });
    expect(started.statusCode).toBe(200);
    const authorization = new URL(started.json().data.authorizationUrl);
    expect(authorization.origin + authorization.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(authorization.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights");
    expect(authorization.searchParams.get("enable_fb_login")).toBe("0");
    expect(authorization.searchParams.get("force_authentication")).toBe("1");
    expect(authorization.searchParams.get("redirect_uri")).toBe(env.INSTAGRAM_OAUTH_REDIRECT_URI);
    expect(authorization.toString()).not.toContain("untrusted.invalid");
    expect(authorization.toString()).not.toContain("unrequested_scope");
  });

  it("requires verified email and a current MFA step-up before Instagram connection", async () => {
    const owner = await principal("OWNER");
    const withoutMfa = await token(owner.userId, owner.workspaceId, false);
    const mfaBlocked = await app.inject({
      method: "POST",
      url: "/v1/workspace/instagram/oauth/start",
      headers: auth(withoutMfa),
      payload: { returnTo: "/en/app/settings" }
    });

    expect(mfaBlocked.statusCode).toBe(403);
    expect(mfaBlocked.json().error.code).toBe("MFA_REQUIRED");

    await prisma.user.update({
      where: { id: owner.userId },
      data: { isVerified: false }
    });

    const emailBlocked = await app.inject({
      method: "POST",
      url: "/v1/workspace/instagram/oauth/start",
      headers: auth(owner.token),
      payload: { returnTo: "/en/app/settings" }
    });

    expect(emailBlocked.statusCode).toBe(403);
    expect(emailBlocked.json().error.code).toBe("EMAIL_VERIFICATION_REQUIRED");
  });

  it("completes, transaction-binds, redirects safely, and rejects duplicate delivery", async () => {
    const info = vi.spyOn(app.log, "info");
    const initiator = await principal("OWNER");
    const other = await principal("OWNER");
    const state = await start(initiator);
    const before = providerCalls;
    const completed = await app.inject({
      method: "GET",
      url: `/v1/workspace/instagram/oauth/callback?code=fake-code&state=${encodeURIComponent(state)}`,
      headers: auth(other.token)
    });
    expect(completed.statusCode).toBe(302);
    expect(completed.headers.location).toBe("http://localhost:3000/en/app/settings?instagram=connected");
    expect(completed.headers.location).not.toContain("fake-code");
    expect(providerCalls - before).toBe(3);
    expect(
      info.mock.calls.filter(
        ([fields]) => typeof fields === "object" && fields !== null && "event" in fields && fields.event === "instagram_oauth_callback_success"
      )
    ).toHaveLength(1);
    expect((await status(initiator)).json().data).toMatchObject({ connected: true, accountId: "route-professional-account" });
    expect((await status(other)).json().data).toMatchObject({ connected: false });

    const replay = await app.inject({
      method: "GET",
      url: `/v1/workspace/instagram/oauth/callback?code=fake-code&state=${encodeURIComponent(state)}`
    });
    expect(replay.statusCode).toBe(302);
    expect(replay.headers.location).toBe("http://localhost:3000/en/app/settings?instagram=error");
    expect(providerCalls - before).toBe(3);
    await app.inject({ method: "DELETE", url: "/v1/workspace/instagram", headers: auth(initiator.token) });
    info.mockRestore();
  });

  it("rejects tampered and expired state before provider exchange and consumes denial", async () => {
    const owner = await principal("OWNER");
    const valid = await start(owner);
    const before = providerCalls;
    for (const state of [`${valid.slice(0, -1)}x`, await expiredState(owner)]) {
      const result = await app.inject({ method: "GET", url: `/v1/workspace/instagram/oauth/callback?code=fake-code&state=${encodeURIComponent(state)}` });
      expect(result.statusCode).toBe(302);
      expect(result.headers.location).toBe("http://localhost:3000/en/app/settings?instagram=error");
    }
    expect(providerCalls).toBe(before);

    const deniedState = await start(owner);
    const denied = await app.inject({
      method: "GET",
      url: `/v1/workspace/instagram/oauth/callback?error=access_denied&state=${encodeURIComponent(deniedState)}`
    });
    expect(denied.statusCode).toBe(302);
    expect(denied.headers.location).toBe("http://localhost:3000/en/app/settings?instagram=error");
    const replay = await app.inject({ method: "GET", url: `/v1/workspace/instagram/oauth/callback?code=fake-code&state=${encodeURIComponent(deniedState)}` });
    expect(replay.headers.location).toBe("http://localhost:3000/en/app/settings?instagram=error");
    expect(providerCalls).toBe(before);
  });

  it("sanitizes an unexpected callback persistence conflict", async () => {
    const warn = vi.spyOn(app.log, "warn");
    const currentOwner = await principal("OWNER");
    const conflictingOwner = await principal("OWNER");
    expect((await complete(currentOwner)).statusCode).toBe(302);
    const state = await start(conflictingOwner);
    const failed = await app.inject({
      method: "GET",
      url: `/v1/workspace/instagram/oauth/callback?code=recognizable-callback-code&state=${encodeURIComponent(state)}&error_description=recognizable-provider-error`,
      headers: { accept: "application/json" }
    });
    expect(failed.statusCode).toBe(400);
    expect(failed.json()).toMatchObject({
      error: { code: "INSTAGRAM_OAUTH_FAILED", message: "Instagram authorization could not be completed" }
    });
    expect(failed.body).not.toContain("recognizable-callback-code");
    expect(failed.body).not.toContain("recognizable-provider-error");
    const terminal = warn.mock.calls.filter(
      ([fields]) => typeof fields === "object" && fields !== null && "event" in fields && fields.event === "instagram_oauth_callback_failure"
    );
    expect(terminal).toHaveLength(1);
    expect(terminal[0]?.[0]).toMatchObject({ stage: "connection_upsert", category: "database_unique_constraint", databaseCode: "P2002" });
    await app.inject({ method: "DELETE", url: "/v1/workspace/instagram", headers: auth(currentOwner.token) });
    warn.mockRestore();
  });

  it("authorizes status, refresh, reconnect, and disconnect by workspace membership and permission", async () => {
    const owner = await principal("OWNER");
    const editor = await member(owner.workspaceId, "EDITOR");
    const outsider = await principal("OWNER");
    await complete(owner);

    for (const [method, url] of [
      ["GET", "/v1/workspace/instagram"],
      ["POST", "/v1/workspace/instagram/refresh"],
      ["DELETE", "/v1/workspace/instagram"]
    ] as const) {
      expect((await app.inject({ method, url })).statusCode).toBe(401);
      expect((await app.inject({ method, url, headers: auth(await token(outsider.userId, owner.workspaceId)) })).statusCode).toBe(403);
    }
    expect((await app.inject({ method: "GET", url: "/v1/workspace/instagram", headers: auth(editor.token) })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/workspace/instagram/refresh", headers: auth(editor.token) })).statusCode).toBe(403);
    expect((await app.inject({ method: "DELETE", url: "/v1/workspace/instagram", headers: auth(editor.token) })).statusCode).toBe(403);
    expect(
      (await app.inject({ method: "POST", url: "/v1/workspace/instagram/oauth/start", headers: auth(owner.token), payload: { returnTo: "/en/app/settings" } }))
        .statusCode
    ).toBe(200);
    const refreshed = await app.inject({ method: "POST", url: "/v1/workspace/instagram/refresh", headers: auth(owner.token) });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().data.reason).toBe("INSTAGRAM_TOKEN_TOO_NEW");
    const disconnected = await app.inject({ method: "DELETE", url: "/v1/workspace/instagram", headers: auth(owner.token) });
    expect(disconnected.statusCode).toBe(200);
    expect(disconnected.json().data).toMatchObject({
      connection: { connected: false, status: "DISCONNECTED" },
      providerRevocation: {
        status: "ACTION_REQUIRED",
        manualRevocationUrl: "https://www.instagram.com/accounts/manage_access/"
      }
    });
  });

  async function complete(input: Principal) {
    const state = await start(input);
    return app.inject({ method: "GET", url: `/v1/workspace/instagram/oauth/callback?code=fake-code&state=${encodeURIComponent(state)}` });
  }
  async function start(input: Principal): Promise<string> {
    const result = await app.inject({
      method: "POST",
      url: "/v1/workspace/instagram/oauth/start",
      headers: auth(input.token),
      payload: { returnTo: "/en/app/settings" }
    });
    expect(result.statusCode).toBe(200);
    return new URL(result.json().data.authorizationUrl).searchParams.get("state")!;
  }
  async function status(input: Principal) {
    return app.inject({ method: "GET", url: "/v1/workspace/instagram", headers: auth(input.token) });
  }
  async function expiredState(input: Principal): Promise<string> {
    return issueOAuthState({
      userId: input.userId,
      workspaceId: input.workspaceId,
      returnTo: "/en/app/settings",
      secret: env.INSTAGRAM_OAUTH_STATE_SECRET!,
      store: createPrismaOAuthStateStore(input.userId, input.workspaceId),
      now: new Date(Date.now() - 120_000),
      ttlSeconds: 1
    });
  }
  async function principal(role: "OWNER" | "EDITOR"): Promise<Principal> {
    const userId = randomUUID();
    const workspaceId = randomUUID();
    userIds.push(userId);
    workspaceIds.push(workspaceId);
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@markos.test`,
        fullName: "Route User",
        locale: "EN",
        isVerified: true,
        mfaEnabled: true,
        mfaSecret: "ROUTEOWNERTESTSECRET"
      }
    });
    await prisma.workspace.create({ data: { id: workspaceId, ownerUserId: userId, name: `Route ${workspaceId}`, slug: `route-${workspaceId}` } });
    await prisma.workspaceMember.create({ data: { workspaceId, userId, role } });
    return { userId, workspaceId, token: await token(userId, workspaceId), role };
  }
  async function member(workspaceId: string, role: "EDITOR"): Promise<Principal> {
    const userId = randomUUID();
    userIds.push(userId);
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@markos.test`,
        fullName: "Route Member",
        locale: "EN",
        isVerified: true,
        mfaEnabled: true,
        mfaSecret: "ROUTEMEMBERTESTSECRET"
      }
    });
    await prisma.workspaceMember.create({ data: { workspaceId, userId, role } });
    return { userId, workspaceId, token: await token(userId, workspaceId), role };
  }
});

type Principal = { userId: string; workspaceId: string; token: string; role: "OWNER" | "EDITOR" };
function auth(value: string) {
  return { authorization: `Bearer ${value}` };
}
async function token(userId: string, workspaceId: string, mfaVerified = true) {
  return new SignJWT({ workspaceId, roles: ["OWNER"], mfaVerified, mfaVerifiedUntil: mfaVerified ? Math.floor(Date.now() / 1000) + 900 : null })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
}
function response(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200 });
}
