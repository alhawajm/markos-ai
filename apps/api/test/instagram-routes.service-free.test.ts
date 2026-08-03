import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/http/app";

describe("Instagram route security without provider or database services", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it.each([
    ["POST", "/v1/workspace/instagram/oauth/start"],
    ["GET", "/v1/workspace/instagram"],
    ["POST", "/v1/workspace/instagram/refresh"],
    ["DELETE", "/v1/workspace/instagram"],
  ])("rejects unauthenticated %s %s", async (method, url) => {
    const response = await app.inject({
      method: method as "GET" | "POST" | "DELETE",
      url,
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "AUTH_REQUIRED" } });
  });

  it("sanitizes malformed and denied callbacks", async () => {
    const warn = vi.spyOn(app.log, "warn");
    const missing = await app.inject({
      method: "GET",
      url: "/v1/workspace/instagram/oauth/callback?code=secret-code",
    });
    expect(missing.statusCode).toBe(302);
    expect(missing.headers.location).toBe(
      "http://localhost:3000/en/app/settings?instagram=error",
    );
    expect(missing.headers.location).not.toContain("secret-code");

    const denied = await app.inject({
      method: "GET",
      url: "/v1/workspace/instagram/oauth/callback?error=access_denied",
      headers: { accept: "application/json" },
    });
    expect(denied.statusCode).toBe(400);
    expect(denied.json()).toMatchObject({
      error: { code: "INSTAGRAM_OAUTH_FAILED" },
    });
    expect(denied.body).not.toContain("access_denied");
    expect(
      warn.mock.calls.filter(
        ([fields]) =>
          typeof fields === "object" &&
          fields !== null &&
          "event" in fields &&
          fields.event === "instagram_oauth_callback_failure",
      ),
    ).toHaveLength(2);
    warn.mockRestore();
  });

  it("emits exactly one classified start authentication failure", async () => {
    const warn = vi.spyOn(app.log, "warn");
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/workspace/instagram/oauth/start",
        })
      ).statusCode,
    ).toBe(401);
    expect(
      warn.mock.calls.filter(
        ([fields]) =>
          typeof fields === "object" &&
          fields !== null &&
          "event" in fields &&
          fields.event === "instagram_oauth_start_failure",
      ),
    ).toHaveLength(1);
    warn.mockRestore();
  });
});
