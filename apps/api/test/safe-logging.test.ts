import { PassThrough } from "node:stream";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { safeLogHooks, safeLogSerializers } from "../src/http/safe-logging";

describe("production logger privacy", () => {
  it("does not log callback query codes, credentials, IPs or raw provider exception messages", async () => {
    const stream = new PassThrough();
    let logs = "";
    stream.on("data", (chunk) => {
      logs += String(chunk);
    });
    const app = Fastify({ logger: { serializers: safeLogSerializers, hooks: safeLogHooks, stream } });
    app.get("/callback", async (_request, reply) => {
      app.log.error({ err: Object.assign(new Error("PRIVATE_PROVIDER_BODY"), { code: "PROVIDER_TIMEOUT" }) }, "Provider failed");
      return reply.code(503).send({ error: "PROVIDER_TIMEOUT" });
    });
    app.get("/error", async () => {
      throw new Error("PRIVATE_EXCEPTION_MESSAGE");
    });
    try {
      await app.inject({ url: "/callback?code=PRIVATE_CODE&state=PRIVATE_STATE", headers: { authorization: "PRIVATE_TOKEN", cookie: "PRIVATE_COOKIE" } });
      await app.inject({ url: "/error" });
      await new Promise<void>((resolve) => setImmediate(resolve));
      for (const secret of [
        "PRIVATE_CODE",
        "PRIVATE_STATE",
        "PRIVATE_TOKEN",
        "PRIVATE_COOKIE",
        "PRIVATE_PROVIDER_BODY",
        "PRIVATE_EXCEPTION_MESSAGE",
        "remoteAddress"
      ])
        expect(logs).not.toContain(secret);
      expect(logs).toContain("PROVIDER_TIMEOUT");
      expect(logs).toContain('"path":"/callback"');
    } finally {
      await app.close();
    }
  });
});
