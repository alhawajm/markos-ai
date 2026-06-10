import { describe, expect, it } from "vitest";
import { buildApp } from "../src/http/app";

describe("health routes", () => {
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
          opensearch: expect.any(Object),
          ai: expect.any(Object)
        }
      }
    });

    await app.close();
  });
});

describe("workspace context", () => {
  it("fails closed without a workspace header", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/v1/workspace-context" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "WORKSPACE_REQUIRED"
      }
    });

    await app.close();
  });

  it("stores a valid workspace header in async context", async () => {
    const app = await buildApp();
    const workspaceId = "018f6d77-7a67-7c02-8f04-09d34bdb1234";
    const response = await app.inject({
      method: "GET",
      url: "/v1/workspace-context",
      headers: {
        "x-workspace-id": workspaceId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        workspaceId
      }
    });

    await app.close();
  });
});
