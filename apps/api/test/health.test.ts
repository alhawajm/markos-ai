import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/http/app";
import { isObservabilityEnabled } from "../src/observability/sentry";
import { prisma } from "../src/db/prisma";

describe("health routes", () => {
  it("checks the authenticated AI boundary and skips unused OpenSearch", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const app = await buildApp();
    try {
      const response = await app.inject({ method: "GET", url: "/v1/ready" });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.dependencies.opensearch.status).toBe("skipped");
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/ai/ready"),
        expect.objectContaining({ headers: { authorization: expect.stringMatching(/^Bearer /) } })
      );
    } finally {
      fetch.mockRestore();
      await app.close();
    }
  });
  it("returns 503 for a broken AI boundary without leaking database failure details", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    const database = vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("postgres://private-user:private-password@internal/production"));
    const app = await buildApp();
    try {
      const response = await app.inject({ method: "GET", url: "/v1/ready" });
      expect(response.statusCode).toBe(503);
      expect(response.json().data.dependencies.ai.detail).toBe("HTTP 401");
      expect(response.body).not.toContain("private-password");
      expect(response.body).not.toContain("internal/production");
    } finally {
      fetch.mockRestore();
      database.mockRestore();
      await app.close();
    }
  });
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
