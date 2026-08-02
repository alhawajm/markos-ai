import type { FastifyInstance } from "fastify";
import { Readable } from "node:stream";
import { env } from "../config/env";
import { errorEnvelope, ok } from "../http/envelope";
import {
  createDataDeletionConfirmationCode,
  disconnectInstagramFromMetaCallback,
  MetaCallbackVerificationError,
  recordInstagramWebhookEvent,
  verifyInstagramWebhookSignature
} from "./meta-service";

const MAX_META_WEBHOOK_BYTES = 1_048_576;

export async function registerMetaRoutes(app: FastifyInstance): Promise<void> {
  const rawWebhookBodies = new WeakMap<object, Buffer>();
  app.addHook("preParsing", async (request, _reply, payload) => {
    if (request.method !== "POST" || request.url.split("?", 1)[0] !== "/v1/meta/webhooks/instagram") return payload;

    const chunks: Buffer[] = [];
    let byteLength = 0;
    for await (const chunk of payload) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteLength += bytes.byteLength;
      if (byteLength > MAX_META_WEBHOOK_BYTES) {
        throw Object.assign(new Error("Meta webhook payload is too large"), { statusCode: 413 });
      }
      chunks.push(bytes);
    }
    const rawBody = Buffer.concat(chunks);
    rawWebhookBodies.set(request, rawBody);
    return Readable.from(rawBody);
  });

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

  app.post("/v1/meta/webhooks/instagram", async (request, reply) => {
    const signature = typeof request.headers["x-hub-signature-256"] === "string"
      ? request.headers["x-hub-signature-256"]
      : undefined;
    const rawBody = rawWebhookBodies.get(request);
    if (!rawBody || !verifyInstagramWebhookSignature(rawBody, signature)) {
      return reply.status(403).send(errorEnvelope("META_WEBHOOK_FORBIDDEN", "Meta webhook signature verification failed"));
    }
    return ok(await recordInstagramWebhookEvent(request.body));
  });

  app.post("/v1/meta/deauthorize", async (request, reply) => {
    try {
      return ok(await disconnectInstagramFromMetaCallback(request.body, { action: "META_DEAUTHORIZE_RECEIVED" }));
    } catch (error) {
      if (error instanceof MetaCallbackVerificationError) {
        return reply.status(403).send(errorEnvelope("META_CALLBACK_FORBIDDEN", "Meta callback verification failed"));
      }
      throw error;
    }
  });

  app.post("/v1/meta/data-deletion", async (request, reply) => {
    try {
      const result = await disconnectInstagramFromMetaCallback(request.body, { action: "META_DATA_DELETION_RECEIVED" });

      return {
        ...result,
        confirmation_code: createDataDeletionConfirmationCode(),
        url: `${env.WEB_BASE_URL}/en/app/settings?dataDeletion=received`
      };
    } catch (error) {
      if (error instanceof MetaCallbackVerificationError) {
        return reply.status(403).send(errorEnvelope("META_CALLBACK_FORBIDDEN", "Meta callback verification failed"));
      }
      throw error;
    }
  });
}
