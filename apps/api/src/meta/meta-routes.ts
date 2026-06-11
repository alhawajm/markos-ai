import type { FastifyInstance } from "fastify";
import { env } from "../config/env";
import { errorEnvelope, ok } from "../http/envelope";

export async function registerMetaRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body.toString())));
  });

  app.get("/v1/meta/webhooks/instagram", async (request, reply) => {
    const query = request.query as {
      "hub.challenge"?: string;
      "hub.mode"?: string;
      "hub.verify_token"?: string;
    };

    if (!env.META_WEBHOOK_VERIFY_TOKEN) {
      return reply
        .status(409)
        .send(errorEnvelope("META_WEBHOOK_NOT_CONFIGURED", "Meta webhook verify token is not configured"));
    }

    if (
      query["hub.mode"] !== "subscribe" ||
      query["hub.verify_token"] !== env.META_WEBHOOK_VERIFY_TOKEN ||
      !query["hub.challenge"]
    ) {
      return reply.status(403).send(errorEnvelope("META_WEBHOOK_FORBIDDEN", "Meta webhook verification failed"));
    }

    return reply.type("text/plain").send(query["hub.challenge"]);
  });

  app.post("/v1/meta/webhooks/instagram", async () => {
    return ok({
      received: true
    });
  });

  app.post("/v1/meta/deauthorize", async () => {
    return ok({
      received: true
    });
  });

  app.post("/v1/meta/data-deletion", async () => {
    return {
      confirmation_code: "markos-meta-deletion-received",
      url: `${env.WEB_BASE_URL}/en/settings?dataDeletion=received`
    };
  });
}
