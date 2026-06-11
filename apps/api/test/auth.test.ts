import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

describe("auth routes", () => {
  it("registers a user, creates an owner workspace, and logs in", async () => {
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
    expect(registerBody.data.tokens.refreshToken).toEqual(expect.any(String));

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
          email
        },
        workspace: {
          id: workspace.id
        },
        roles: ["OWNER"]
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
    const duplicateResponse = await app.inject({ method: "POST", url: "/v1/auth/register", payload });

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
    const originalRefreshToken = originalSession.tokens.refreshToken;

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: {
        refreshToken: originalRefreshToken
      }
    });
    const refreshedSession = refreshResponse.json().data;

    expect(refreshResponse.statusCode).toBe(200);
    expect(refreshedSession.user.email).toBe(email);
    expect(refreshedSession.tokens.refreshToken).toEqual(expect.any(String));
    expect(refreshedSession.tokens.refreshToken).not.toBe(originalRefreshToken);

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
      payload: {
        refreshToken: originalRefreshToken
      }
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
      payload: {
        refreshToken: refreshedSession.tokens.refreshToken
      }
    });

    expect(revokedFamilyResponse.statusCode).toBe(401);
    expect(revokedFamilyResponse.json()).toMatchObject({
      error: {
        code: "REFRESH_TOKEN_REUSE_DETECTED"
      }
    });

    await app.close();
  });
});
