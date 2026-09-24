import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { env } from "../src/config/env";
import { enableMfaTotp, register, setupMfaTotp, verifyMfaTotpSession } from "../src/auth/auth-service";
import { registerNativeAuthRoutes } from "../src/auth/native-auth-routes";
import { registerWorkspaceContext } from "../src/tenancy/workspace-plugin";
import { registerAuthRateLimits } from "../src/auth/auth-rate-limit";
import { generateTotpCode } from "../src/auth/totp";
import { verifyAccessToken } from "../src/auth/tokens";

if (env.NODE_ENV !== "test" || new URL(env.DATABASE_URL).pathname !== "/markos_account_recovery_test" || env.EMAIL_PROVIDER !== "local")
  throw new Error("Use only the disposable markos_account_recovery_test database and local email provider");
const app = Fastify({ logger: false });
beforeAll(async () => {
  await registerWorkspaceContext(app);
  await registerAuthRateLimits(app);
  await registerNativeAuthRoutes(app);
  app.get("/test/sensitive", { config: { workspaceRequired: true, mfaRequired: true } }, async (request) => ({ workspaceId: request.auth!.workspaceId }));
  app.post("/v1/auth/mfa/totp/verify", { config: { workspaceRequired: true } }, async () => ({ verified: false }));
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
async function account(verified = true) {
  const grant = await register({
    email: `native-mfa-${randomUUID()}@example.test`,
    password: "Unique fixture password 42!",
    fullName: "MFA Owner",
    locale: "en"
  });
  const userId = grant.session.user.id;
  if (verified) await prisma.user.update({ where: { id: userId }, data: { isVerified: true } });
  const setup = await setupMfaTotp(userId);
  const code = generateTotpCode(setup.secret);
  await enableMfaTotp(userId, { code });
  return { ...grant, userId, code };
}
const headers = { "x-markos-session": "native" };
function verify(token: string, code: string, extra = {}) {
  return app.inject({
    method: "POST",
    url: "/v1/auth/native/mfa/totp/verify",
    headers: { ...headers, authorization: `Bearer ${token}` },
    payload: { code, ...extra }
  });
}
describe("native MFA with real workspace and session guards", () => {
  it("creates an MFA grant for only the authenticated user/workspace, without a cookie", async () => {
    const a = await account();
    const b = await account();
    const result = await verify(a.session.tokens.accessToken, a.code, { userId: b.userId, workspaceId: b.session.workspace.id });
    expect(result.statusCode).toBe(200);
    expect(result.headers["set-cookie"]).toBeUndefined();
    expect(result.headers["cache-control"]).toBe("no-store");
    const session = result.json().data;
    expect(session.user.id).toBe(a.userId);
    expect(session.workspace.id).toBe(a.session.workspace.id);
    expect(session.mfaVerified).toBe(true);
    expect(session.mfaVerifiedUntil).toBeGreaterThan(Date.now() / 1000);
    expect((await verifyAccessToken(session.tokens.accessToken)).workspaceId).toBe(a.session.workspace.id);
    expect((await app.inject({ url: "/test/sensitive", headers: { authorization: `Bearer ${session.tokens.accessToken}` } })).statusCode).toBe(200);
    const rotated = await app.inject({ method: "POST", url: "/v1/auth/native/refresh", headers, payload: { refreshToken: session.tokens.refreshToken } });
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json().data.mfaVerifiedUntil).toBe(session.mfaVerifiedUntil);
    await expect(setupMfaTotp(a.userId)).rejects.toThrow();
  });
  it("rejects anonymous, unverified, revoked and cross-workspace grants", async () => {
    expect((await verify("invalid", "123456")).statusCode).toBe(401);
    const unverified = await account(false);
    expect((await verify(unverified.session.tokens.accessToken, unverified.code)).json().error.code).toBe("EMAIL_VERIFICATION_REQUIRED");
    const a = await account();
    const b = await account();
    await expect(verifyMfaTotpSession({ userId: a.userId, workspaceId: b.session.workspace.id, code: a.code, authVersion: 0 })).rejects.toThrow();
    await prisma.user.update({ where: { id: a.userId }, data: { authVersion: { increment: 1 } } });
    expect((await verify(a.session.tokens.accessToken, a.code)).statusCode).toBe(401);
    await expect(verifyMfaTotpSession({ userId: a.userId, workspaceId: a.session.workspace.id, code: a.code, authVersion: 0 })).rejects.toThrow();
    await prisma.workspaceMember.updateMany({ where: { userId: b.userId }, data: { deletedAt: new Date() } });
    expect((await verify(b.session.tokens.accessToken, b.code)).json().error.code).toBe("WORKSPACE_FORBIDDEN");
  });
  it("limits MFA attempts across native and browser paths by authenticated user", async () => {
    const a = await account();
    // Invalid shape still consumes an attempt; no TOTP timing ambiguity in this assertion.
    for (let i = 0; i < 5; i++) expect((await verify(a.session.tokens.accessToken, "invalid")).statusCode).toBe(400);
    const limited = await app.inject({
      method: "POST",
      url: "/v1/auth/mfa/totp/verify",
      headers: { authorization: `Bearer ${a.session.tokens.accessToken}` },
      payload: { code: a.code }
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
    const b = await account();
    expect((await verify(b.session.tokens.accessToken, b.code)).statusCode).toBe(200);
  });
});
