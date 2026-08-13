import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { env } from "../src/config/env";
import { buildApp } from "../src/http/app";

describe("browser CORS", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it("allows the web app to use every API client method", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/workspace/instagram",
      headers: {
        origin: env.WEB_BASE_URL,
        "access-control-request-headers": "authorization,content-type,x-workspace-id",
        "access-control-request-method": "DELETE"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(env.WEB_BASE_URL);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");

    const allowedMethods = new Set(response.headers["access-control-allow-methods"]?.split(",").map((method) => method.trim()));
    expect(allowedMethods).toEqual(new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]));
  });
});
