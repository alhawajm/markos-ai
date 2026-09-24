import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { env } from "../src/config/env";
import { register, login, requestEmailVerification, verifyEmail } from "../src/auth/auth-service";
import { registerNativeAuthRoutes } from "../src/auth/native-auth-routes";
import { registerPasswordRoutes } from "../src/auth/password-routes";
import { registerAuthRateLimits } from "../src/auth/auth-rate-limit";
import { registerWorkspaceContext } from "../src/tenancy/workspace-plugin";
import { processAuthEmails, type AuthMail } from "../src/auth/auth-email";
import { generateTotpCode, generateTotpSecret } from "../src/auth/totp";
import { accountPolicyVersion } from "@markos/validation";

if (new URL(env.DATABASE_URL).pathname !== "/markos_account_recovery_test" || env.NODE_ENV !== "test" || env.EMAIL_PROVIDER !== "local")
  throw new Error("Use the dedicated markos_account_recovery_test database and local email provider");
const password = "Correct Horse Battery 99!";
const replacement = "Another unique passphrase 42!";
const headers = { "x-markos-session": "native" };
const app = Fastify({ logger: false });
beforeAll(async () => {
  await prisma.authEmailJob.deleteMany();
  await prisma.passwordResetChallenge.deleteMany();
  await registerWorkspaceContext(app);
  await registerAuthRateLimits(app);
  await registerNativeAuthRoutes(app);
  await registerPasswordRoutes(app);
  app.get("/test/protected", { config: { workspaceRequired: true } }, async (request) => ({ user: request.auth?.userId }));
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
async function account() {
  const email = `reset-${randomUUID()}@example.test`;
  const grant = await register({ email, password, fullName: "Recovery Owner", workspaceName: `Recovery ${randomUUID()}`, locale: "en" });
  return { email, ...grant };
}
async function requestCode(email: string) {
  const response = await app.inject({ method: "POST", url: "/v1/auth/password/forgot", payload: { email, locale: "en" } });
  expect(response.statusCode).toBe(202);
  return response.json().data as { challengeId: string; expiresAt: string };
}
async function deliver(email: string) {
  const sent: AuthMail[] = [];
  await processAuthEmails(async (mail) => {
    sent.push(mail);
  });
  return sent.find((mail) => mail.email === email && mail.kind === "RESET_CODE")!.code!;
}
async function reset(challengeId: string, code: string) {
  return app.inject({ method: "POST", url: "/v1/auth/password/reset", payload: { challengeId, code, password: replacement, confirmPassword: replacement } });
}

describe("account recovery with PostgreSQL and Redis", () => {
  it("consumes verification links once and invalidates replaced links", async () => {
    const owner = await account();
    const old = await requestEmailVerification({ email: owner.email, locale: "en" });
    const current = await requestEmailVerification({ email: owner.email, locale: "en" });
    await expect(verifyEmail({ token: old.verificationToken! })).rejects.toThrow();
    const results = await Promise.allSettled([verifyEmail({ token: current.verificationToken! }), verifyEmail({ token: current.verificationToken! })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });
  it("creates a native owner with recorded consent, a queued verification and no browser cookie", async () => {
    const payload = {
      email: `signup-${randomUUID()}@example.test`,
      password,
      fullName: "Native Owner",
      locale: "ar",
      acceptedTerms: true,
      policyVersion: accountPolicyVersion
    };
    const rejected = await app.inject({ method: "POST", url: "/v1/auth/native/register", headers, payload: { ...payload, acceptedTerms: false } });
    expect(rejected.statusCode).toBe(400);
    const response = await app.inject({ method: "POST", url: "/v1/auth/native/register", headers, payload });
    expect(response.statusCode).toBe(201);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json().data.user.isVerified).toBe(false);
    expect(response.json().data.tokens.refreshToken).toEqual(expect.any(String));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: payload.email } });
    expect(user.termsVersion).toBe(accountPolicyVersion);
    expect(user.termsAcceptedAt).not.toBeNull();
    expect(user.passwordHash).not.toContain(password);
    expect(await prisma.workspaceMember.count({ where: { userId: user.id, role: "OWNER" } })).toBe(1);
    expect(await prisma.authEmailJob.count({ where: { kind: "VERIFY", status: "PENDING" } })).toBeGreaterThan(0);
    const duplicate = await app.inject({ method: "POST", url: "/v1/auth/native/register", headers, payload });
    expect(duplicate.statusCode).toBe(409);
  });
  it("has identical recovery responses for unknown accounts, encrypts delivery data, and revokes only the changed account", async () => {
    const owner = await account();
    const other = await account();
    const challenge = await requestCode(owner.email);
    const unknown = await requestCode(`absent-${randomUUID()}@example.test`);
    expect(Object.keys(challenge).sort()).toEqual(Object.keys(unknown).sort());
    expect(Date.parse(challenge.expiresAt) - Date.now()).toBeLessThanOrEqual(600_000);
    const job = await prisma.authEmailJob.findFirstOrThrow({ where: { challengeId: challenge.challengeId } });
    expect(job.payload).not.toContain(owner.email);
    const code = await deliver(owner.email);
    expect(code).toMatch(/^\d{8}$/);
    expect((await prisma.passwordResetChallenge.findUniqueOrThrow({ where: { id: challenge.challengeId } })).codeHash).not.toBe(code);
    const changed = await reset(challenge.challengeId, code);
    expect(changed.statusCode).toBe(200);
    expect(changed.headers["set-cookie"]).toBeUndefined();
    expect(changed.json().data).toEqual({ reset: true });
    expect((await app.inject({ url: "/test/protected", headers: { authorization: `Bearer ${owner.session.tokens.accessToken}` } })).statusCode).toBe(401);
    expect((await app.inject({ url: "/test/protected", headers: { authorization: `Bearer ${other.session.tokens.accessToken}` } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/auth/native/refresh", headers, payload: { refreshToken: owner.refreshToken } })).statusCode).toBe(401);
    await expect(login({ email: owner.email, password })).rejects.toThrow();
    expect((await login({ email: owner.email, password: replacement })).session.user.id).toBe(owner.session.user.id);
    expect((await reset(challenge.challengeId, code)).statusCode).toBe(400);
  });
  it("enforces five attempts and expiry without changing the password", async () => {
    const owner = await account();
    const challenge = await requestCode(owner.email);
    const code = await deliver(owner.email);
    const wrong = code === "00000000" ? "11111111" : "00000000";
    for (let i = 0; i < 5; i++) expect((await reset(challenge.challengeId, wrong)).statusCode).toBe(400);
    expect((await reset(challenge.challengeId, code)).statusCode).toBe(400);
    const expired = await requestCode(owner.email);
    const expiredCode = await deliver(owner.email);
    await prisma.passwordResetChallenge.update({ where: { id: expired.challengeId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await reset(expired.challengeId, expiredCode)).statusCode).toBe(400);
    expect((await login({ email: owner.email, password })).session.user.id).toBe(owner.session.user.id);
  });
  it("allows only one concurrent reset and queues one password-change notification", async () => {
    const owner = await account();
    const challenge = await requestCode(owner.email);
    const code = await deliver(owner.email);
    const results = await Promise.all([reset(challenge.challengeId, code), reset(challenge.challengeId, code)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400]);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: owner.email } })).authVersion).toBe(1);
    const sent: AuthMail[] = [];
    await processAuthEmails(async (mail) => {
      sent.push(mail);
    });
    expect(sent.filter((mail) => mail.email === owner.email && mail.kind === "PASSWORD_CHANGED")).toHaveLength(1);
  });
  it("rejects cross-account codes and password mismatches without consuming a valid attempt", async () => {
    const a = await account();
    const b = await account();
    const ca = await requestCode(a.email);
    const code = await deliver(a.email);
    const cb = await requestCode(b.email);
    await deliver(b.email);
    expect((await reset(cb.challengeId, code)).statusCode).toBe(400);
    const invalid = await app.inject({
      method: "POST",
      url: "/v1/auth/password/reset",
      payload: { challengeId: ca.challengeId, code, password: replacement, confirmPassword: "different" }
    });
    expect(invalid.statusCode).toBe(400);
    expect((await prisma.passwordResetChallenge.findUniqueOrThrow({ where: { id: ca.challengeId } })).attempts).toBe(0);
  });
  it("retains and enforces an owner's enabled authenticator after password reset", async () => {
    const owner = await account();
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { email: owner.email }, data: { mfaEnabled: true, mfaSecret: secret } });
    const challenge = await requestCode(owner.email);
    const code = await deliver(owner.email);
    expect((await reset(challenge.challengeId, code)).statusCode).toBe(200);
    const missing = await app.inject({ method: "POST", url: "/v1/auth/native/login", headers, payload: { email: owner.email, password: replacement } });
    expect(missing.statusCode).toBe(401);
    expect(missing.json().error.code).toBe("MFA_REQUIRED");
    expect((await login({ email: owner.email, password: replacement, totpCode: generateTotpCode(secret) })).session.mfaVerified).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: owner.email } })).mfaSecret).toBe(secret);
  });
  it("retries delivery with the same code and erases the encrypted payload after acceptance", async () => {
    const owner = await account();
    const challenge = await requestCode(owner.email);
    let firstCode = "";
    await processAuthEmails(async (mail) => {
      if (mail.email === owner.email) {
        firstCode = mail.code!;
        throw new Error("provider unavailable");
      }
    });
    const job = await prisma.authEmailJob.findFirstOrThrow({ where: { challengeId: challenge.challengeId } });
    expect(job.status).toBe("PENDING");
    expect(job.payload).not.toBeNull();
    await prisma.authEmailJob.update({ where: { id: job.id }, data: { availableAt: new Date(Date.now() - 1000) } });
    expect(await deliver(owner.email)).toBe(firstCode);
    expect((await prisma.authEmailJob.findUniqueOrThrow({ where: { id: job.id } })).payload).toBeNull();
  });
  it("coordinates parallel mail processors without duplicate sends", async () => {
    const owner = await account();
    await requestCode(owner.email);
    const sent: string[] = [];
    const send = async (mail: AuthMail) => {
      if (mail.email === owner.email) sent.push(mail.code!);
    };
    await Promise.all([processAuthEmails(send), processAuthEmails(send)]);
    expect(sent).toHaveLength(1);
  });
  it("rate limits normalized email even if forwarded headers are forged", async () => {
    const email = `limit-${randomUUID()}@example.test`;
    for (let n = 0; n < 5; n++) await requestCode(email);
    const blocked = await app.inject({
      method: "POST",
      url: "/v1/auth/password/forgot",
      headers: { "x-forwarded-for": "1.2.3.4" },
      payload: { email: email.toUpperCase() }
    });
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.json().error.code).toBe("AUTH_RATE_LIMITED");
  });
});
