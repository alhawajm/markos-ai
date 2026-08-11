import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { resetGoogleTokenVerifierForTest, setGoogleTokenVerifierForTest } from "../src/auth/auth-service";
import { generateTotpCode } from "../src/auth/totp";
import { buildApp } from "../src/http/app";

describe("auth routes", () => {
  afterEach(() => {
    resetGoogleTokenVerifierForTest();
  });

  it("registers a user, verifies email, creates an owner workspace, and logs in", async () => {
    const app = await buildApp();
    const workspaceSuffix = randomUUID();
    const email = `founder-${randomUUID()}@markos.test`;
    const password = "CorrectHorseBattery99!";
    const workspaceName = `Mariam Studio ${workspaceSuffix}`;
    const expectedSlug = `mariam-studio-${workspaceSuffix}`;

    const registerResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password,
        fullName: "Mariam Founder",
        workspaceName,
        locale: "en"
      }
    });

    expect(registerResponse.statusCode).toBe(201);
    const registerBody = registerResponse.json();
    expect(registerBody.data).toMatchObject({
      mfaVerified: false,
      user: {
        email,
        fullName: "Mariam Founder",
        locale: "en",
        isVerified: false
      },
      workspace: {
        name: workspaceName
      },
      roles: ["OWNER"]
    });
    expect(registerBody.data.tokens.accessToken).toEqual(expect.any(String));
    expect(registerBody.data.tokens.refreshToken).toBeUndefined();
    expect(registerResponse.headers["set-cookie"]).toContain("markos_refresh=");
    expect(registerResponse.headers["set-cookie"]).toContain("HttpOnly");
    expect(registerResponse.headers["set-cookie"]).toContain("Path=/v1/auth");

    const user = await prisma.user.findUniqueOrThrow({
      where: { email }
    });
    const workspace = await prisma.workspace.findFirstOrThrow({
      where: { ownerUserId: user.id }
    });
    const membership = await prisma.workspaceMember.findFirstOrThrow({
      where: {
        userId: user.id,
        workspaceId: workspace.id
      }
    });

    expect(workspace.slug).toBe(expectedSlug);
    expect(membership.role).toBe("OWNER");

    const unverifiedLoginResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email,
        password
      }
    });

    expect(unverifiedLoginResponse.statusCode).toBe(200);
    expect(unverifiedLoginResponse.json()).toMatchObject({
      data: {
        user: {
          email,
          isVerified: false
        },
        workspace: {
          id: workspace.id
        },
        roles: ["OWNER"]
      }
    });

    const unverifiedSession = unverifiedLoginResponse.json().data;
    const unverifiedContentListResponse = await app.inject({
      method: "GET",
      url: "/v1/content",
      headers: authHeaders(unverifiedSession.tokens.accessToken)
    });
    const unverifiedGenerateResponse = await app.inject({
      method: "POST",
      url: "/v1/content/generate",
      headers: authHeaders(unverifiedSession.tokens.accessToken),
      payload: {
        contentType: "POST",
        prompt: "Create a launch post."
      }
    });

    expect(unverifiedContentListResponse.statusCode).toBe(200);
    expect(unverifiedGenerateResponse.statusCode).toBe(403);
    expect(unverifiedGenerateResponse.json()).toMatchObject({
      error: {
        code: "EMAIL_VERIFICATION_REQUIRED"
      }
    });

    const verificationRequestResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/verification/request",
      payload: {
        email
      }
    });
    const verificationRequestBody = verificationRequestResponse.json();

    expect(verificationRequestResponse.statusCode).toBe(200);
    expect(verificationRequestBody.data).toMatchObject({
      alreadyVerified: false,
      email
    });
    expect(verificationRequestBody.data.verificationToken).toEqual(expect.any(String));

    const verificationResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/verify-email",
      payload: {
        token: verificationRequestBody.data.verificationToken
      }
    });

    expect(verificationResponse.statusCode).toBe(200);
    expect(verificationResponse.json()).toMatchObject({
      data: {
        email,
        isVerified: true
      }
    });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email,
        password
      }
    });

    expect(loginResponse.statusCode).toBe(200);
    expect(loginResponse.json()).toMatchObject({
      data: {
        user: {
          email,
          isVerified: true
        },
        workspace: {
          id: workspace.id
        },
        roles: ["OWNER"]
      }
    });

    await app.close();
  }, 60_000);

  it("creates a verified Google user, owner workspace, and session", async () => {
    const app = await buildApp();
    const email = `google-${randomUUID()}@markos.test`;
    const workspaceName = `Google Workspace ${randomUUID()}`;

    setGoogleTokenVerifierForTest(async () => ({
      email,
      emailVerified: true,
      fullName: "Google Founder",
      googleId: `google-${randomUUID()}`
    }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: {
        idToken: "test-google-id-token",
        locale: "en",
        workspaceName
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        user: {
          email,
          fullName: "Google Founder",
          isVerified: true,
          locale: "en"
        },
        workspace: {
          name: workspaceName
        },
        roles: ["OWNER"]
      }
    });
    expect(response.json().data.tokens.accessToken).toEqual(expect.any(String));

    const user = await prisma.user.findUniqueOrThrow({
      where: { email }
    });
    const membership = await prisma.workspaceMember.findFirstOrThrow({
      where: {
        userId: user.id,
        workspaceId: response.json().data.workspace.id
      }
    });

    expect(user.passwordHash).toBeNull();
    expect(user.googleId).toEqual(expect.any(String));
    expect(user.isVerified).toBe(true);
    expect(membership.role).toBe("OWNER");

    await app.close();
  });

  it("links Google login to an existing email account", async () => {
    const app = await buildApp();
    const email = `google-link-${randomUUID()}@markos.test`;
    const googleId = `google-${randomUUID()}`;
    const registerResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "CorrectHorseBattery99!",
        fullName: "Existing User",
        locale: "en"
      }
    });
    const originalWorkspaceId = registerResponse.json().data.workspace.id;

    setGoogleTokenVerifierForTest(async () => ({
      email,
      emailVerified: true,
      fullName: "Existing User From Google",
      googleId
    }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: {
        idToken: "test-google-id-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        user: {
          email,
          isVerified: true
        },
        workspace: {
          id: originalWorkspaceId
        },
        roles: ["OWNER"]
      }
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { email }
    });
    expect(user.googleId).toBe(googleId);
    expect(user.isVerified).toBe(true);

    await app.close();
  });

  it("rejects Google login when Google has not verified the email", async () => {
    const app = await buildApp();

    setGoogleTokenVerifierForTest(async () => ({
      email: `google-unverified-${randomUUID()}@markos.test`,
      emailVerified: false,
      fullName: "Unverified Google User",
      googleId: `google-${randomUUID()}`
    }));

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/google",
      payload: {
        idToken: "test-google-id-token"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: "GOOGLE_EMAIL_NOT_VERIFIED"
      }
    });

    await app.close();
  });

  it("reports Google OAuth configuration status", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/google/configuration"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        configured: false,
        missing: ["GOOGLE_OAUTH_CLIENT_ID"]
      }
    });

    await app.close();
  });

  it("rejects invalid email verification tokens", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/verify-email",
      payload: {
        token: "x".repeat(32)
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "EMAIL_VERIFICATION_INVALID"
      }
    });

    await app.close();
  });

  it("rejects duplicate registration", async () => {
    const app = await buildApp();
    const email = `duplicate-${randomUUID()}@markos.test`;
    const payload = {
      email,
      password: "CorrectHorseBattery99!",
      fullName: "Duplicate User",
      locale: "en"
    };

    expect((await app.inject({ method: "POST", url: "/v1/auth/register", payload })).statusCode).toBe(201);
    const duplicateResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload
    });

    expect(duplicateResponse.statusCode).toBe(409);
    expect(duplicateResponse.json()).toMatchObject({
      error: {
        code: "EMAIL_ALREADY_EXISTS"
      }
    });

    await app.close();
  });

  it("rejects invalid login credentials", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email: `missing-${randomUUID()}@markos.test`,
        password: "wrong"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: "INVALID_CREDENTIALS"
      }
    });

    await app.close();
  });

  it("enrolls TOTP MFA and requires it for finance/admin roles", async () => {
    const app = await buildApp();
    const email = `mfa-${randomUUID()}@markos.test`;
    const password = "CorrectHorseBattery99!";
    const session = await registerVerifiedUser(app, { email, password });

    const setupResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/mfa/totp/setup",
      headers: authHeaders(session.tokens.accessToken)
    });
    const setup = setupResponse.json().data;
    const code = generateTotpCode(setup.secret);
    const invalidCode = code === "000000" ? "000001" : "000000";

    expect(setupResponse.statusCode).toBe(200);
    expect(setup).toMatchObject({
      enabled: false,
      secret: expect.any(String)
    });
    expect(setup.otpauthUri).toContain("otpauth://totp/");

    const enableResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/mfa/totp/enable",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        code
      }
    });

    expect(enableResponse.statusCode).toBe(200);
    expect(enableResponse.json()).toMatchObject({
      data: {
        enabled: true
      }
    });

    const statusResponse = await app.inject({
      method: "GET",
      url: "/v1/auth/mfa/totp",
      headers: authHeaders(session.tokens.accessToken)
    });
    const stepUpResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/mfa/totp/verify",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        code: generateTotpCode(setup.secret)
      }
    });
    const repeatedSetupResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/mfa/totp/setup",
      headers: authHeaders(session.tokens.accessToken)
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json().data).toEqual({ enabled: true });
    expect(stepUpResponse.statusCode).toBe(200);
    expect(stepUpResponse.json().data.mfaVerified).toBe(true);
    expect(stepUpResponse.headers["set-cookie"]).toContain("markos_refresh=");
    expect(repeatedSetupResponse.statusCode).toBe(409);
    expect(repeatedSetupResponse.json().error.code).toBe("MFA_ALREADY_ENABLED");

    const ownerRefreshResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: browserSessionHeaders(cookiePair(stepUpResponse))
    });

    expect(ownerRefreshResponse.statusCode).toBe(200);
    expect(ownerRefreshResponse.json().data.mfaVerified).toBe(false);

    await prisma.workspaceMember.updateMany({
      data: {
        role: "FINANCE_ADMIN"
      },
      where: {
        userId: session.user.id,
        workspaceId: session.workspace.id
      }
    });

    const missingCodeResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email,
        password
      }
    });
    const invalidCodeResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email,
        password,
        totpCode: invalidCode
      }
    });
    const validLoginResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email,
        password,
        totpCode: generateTotpCode(setup.secret)
      }
    });

    expect(missingCodeResponse.statusCode).toBe(401);
    expect(missingCodeResponse.json().error.code).toBe("MFA_REQUIRED");
    expect(invalidCodeResponse.statusCode).toBe(401);
    expect(invalidCodeResponse.json().error.code).toBe("MFA_INVALID");
    expect(validLoginResponse.statusCode).toBe(200);
    expect(validLoginResponse.json()).toMatchObject({
      data: {
        mfaVerified: true,
        roles: ["FINANCE_ADMIN"],
        user: {
          email
        }
      }
    });

    const staleRefreshResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: browserSessionHeaders(session.refreshCookie)
    });
    const verifiedRefreshResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: browserSessionHeaders(cookiePair(validLoginResponse))
    });

    expect(staleRefreshResponse.statusCode).toBe(401);
    expect(staleRefreshResponse.json().error.code).toBe("MFA_REQUIRED");
    expect(verifiedRefreshResponse.statusCode).toBe(200);
    expect(verifiedRefreshResponse.json().data.roles).toEqual(["FINANCE_ADMIN"]);

    await app.close();
  });

  it("blocks sensitive-role login until TOTP MFA is enabled", async () => {
    const app = await buildApp();
    const email = `mfa-required-${randomUUID()}@markos.test`;
    const password = "CorrectHorseBattery99!";
    const session = await registerVerifiedUser(app, { email, password });

    await prisma.workspaceMember.updateMany({
      data: {
        role: "WORKSPACE_ADMIN"
      },
      where: {
        userId: session.user.id,
        workspaceId: session.workspace.id
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        email,
        password
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("MFA_SETUP_REQUIRED");

    await app.close();
  });

  it("rotates refresh tokens and rejects reused tokens", async () => {
    const app = await buildApp();
    const email = `refresh-${randomUUID()}@markos.test`;
    const password = "CorrectHorseBattery99!";
    const registerResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password,
        fullName: "Refresh User",
        locale: "en"
      }
    });
    const originalSession = registerResponse.json().data;
    const originalRefreshCookie = cookiePair(registerResponse);

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: browserSessionHeaders(originalRefreshCookie)
    });
    const refreshedSession = refreshResponse.json().data;
    const refreshedCookie = cookiePair(refreshResponse);

    expect(refreshResponse.statusCode).toBe(200);
    expect(refreshedSession.user.email).toBe(email);
    expect(refreshedSession.tokens.refreshToken).toBeUndefined();
    expect(refreshedCookie).not.toBe(originalRefreshCookie);

    const contextResponse = await app.inject({
      method: "GET",
      url: "/v1/workspace-context",
      headers: {
        authorization: `Bearer ${refreshedSession.tokens.accessToken}`
      }
    });

    expect(contextResponse.statusCode).toBe(200);
    expect(contextResponse.json()).toMatchObject({
      data: {
        workspaceId: refreshedSession.workspace.id,
        userId: refreshedSession.user.id,
        roles: ["OWNER"]
      }
    });

    const replayResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: browserSessionHeaders(originalRefreshCookie)
    });

    expect(replayResponse.statusCode).toBe(401);
    expect(replayResponse.json()).toMatchObject({
      error: {
        code: "REFRESH_TOKEN_REUSE_DETECTED"
      }
    });

    const revokedFamilyResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: browserSessionHeaders(refreshedCookie)
    });

    expect(revokedFamilyResponse.statusCode).toBe(401);
    expect(revokedFamilyResponse.json()).toMatchObject({
      error: {
        code: "REFRESH_TOKEN_REUSE_DETECTED"
      }
    });

    await app.close();
  });

  it("revokes the current refresh cookie on logout", async () => {
    const app = await buildApp();
    const registerResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: `logout-${randomUUID()}@markos.test`,
        password: "CorrectHorseBattery99!",
        fullName: "Logout User",
        locale: "en"
      }
    });
    const refreshCookie = cookiePair(registerResponse);

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: browserSessionHeaders(refreshCookie)
    });
    const refreshAfterLogout = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: browserSessionHeaders(refreshCookie)
    });

    expect(logoutResponse.statusCode).toBe(200);
    expect(logoutResponse.headers["set-cookie"]).toContain("Max-Age=0");
    expect(refreshAfterLogout.statusCode).toBe(401);
    expect(refreshAfterLogout.json().error.code).toBe("REFRESH_TOKEN_REUSE_DETECTED");

    await app.close();
  });
});

async function registerVerifiedUser(app: Awaited<ReturnType<typeof buildApp>>, input: { email: string; password: string }) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: input.email,
      password: input.password,
      fullName: "MFA User",
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
    refreshCookie: cookiePair(response),
    user: {
      ...session.user,
      isVerified: true
    }
  };
}

function browserSessionHeaders(cookie: string): Record<string, string> {
  return {
    cookie,
    "x-markos-session": "browser"
  };
}

function cookiePair(response: { headers: Record<string, number | string | string[] | undefined> }): string {
  const setCookie = response.headers["set-cookie"];
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;

  if (typeof value !== "string") throw new Error("Expected refresh cookie");
  return value.split(";", 1)[0]!;
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`
  };
}
