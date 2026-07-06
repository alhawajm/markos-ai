import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/http/app";
import { isObservabilityEnabled } from "../src/observability/sentry";

describe("health routes", () => {
  it("keeps observability disabled without a DSN", async () => {
    const app = await buildApp();

    expect(isObservabilityEnabled()).toBe(false);

    await app.close();
  });

  it("returns the API health envelope", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        service: "api",
        status: "ok"
      }
    });

    await app.close();
  });

  it("returns the deep health dependency envelope", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/health/deep" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        service: "api",
        dependencies: {
          database: expect.any(Object),
          redis: expect.any(Object),
          opensearch: expect.objectContaining({
            durationMs: expect.any(Number)
          }),
          ai: expect.objectContaining({
            durationMs: expect.any(Number)
          })
        }
      }
    });

    await app.close();
  });
});

describe("workspace context", () => {
  it("fails closed without a bearer token", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/workspace-context" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: "AUTH_REQUIRED"
      }
    });

    await app.close();
  });

  it("rejects invalid bearer tokens", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/workspace-context",
      headers: {
        authorization: "Bearer invalid"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: "INVALID_TOKEN"
      }
    });

    await app.close();
  });

  it("stores a valid authenticated workspace in async context", async () => {
    const app = await buildApp();
    const registration = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: `workspace-context-${randomUUID()}@markos.test`,
        password: "CorrectHorseBattery99!",
        fullName: "Workspace Context",
        locale: "en"
      }
    });
    const session = registration.json().data;
    const response = await app.inject({
      method: "GET",
      url: "/v1/workspace-context",
      headers: {
        authorization: `Bearer ${session.tokens.accessToken}`
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        workspaceId: session.workspace.id,
        userId: session.user.id,
        roles: ["OWNER"]
      }
    });

    await app.close();
  });
});
