import type { FastifyInstance, FastifyRequest } from "fastify";
import { Readable } from "node:stream";
import { env } from "../config/env";
import { errorEnvelope, ok } from "../http/envelope";
import {
  classifyMetaCallbackContentType,
  type MetaCallbackStageUpdate,
  type MetaCallbackType,
  reportMetaCallbackStage
} from "./meta-callback-telemetry";
import {
  createDataDeletionConfirmationCode,
  disconnectInstagramFromMetaCallback,
  MetaCallbackVerificationError,
  recordInstagramWebhookEvent,
  verifyInstagramWebhookSignature
} from "./meta-service";

const MAX_META_WEBHOOK_BYTES = 1_048_576;
const MAX_META_CALLBACK_BYTES = 65_536;

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

  await registerMetaCallbackRoutes(app);
}

async function registerMetaCallbackRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (callbackApp) => {
    const parseBody = (request: FastifyRequest, body: string | Buffer, done: (error: Error | null, value?: unknown) => void) => {
      done(null, parseMetaCallbackBody(body.toString(), request.headers["content-type"]));
    };
    callbackApp.removeContentTypeParser("text/plain");
    callbackApp.addContentTypeParser("text/plain", { bodyLimit: MAX_META_CALLBACK_BYTES, parseAs: "string" }, parseBody);
    callbackApp.addContentTypeParser("*", { bodyLimit: MAX_META_CALLBACK_BYTES, parseAs: "string" }, parseBody);

    callbackApp.addHook("onRequest", async (request) => {
      const callbackType = metaCallbackType(request.url);
      if (!callbackType) return;
      reportMetaCallbackStage({
        callbackType,
        logger: request.log,
        requestId: request.id,
        update: {
          stage: "callback_request",
          outcome: "received",
          contentTypeCategory: classifyMetaCallbackContentType(request.headers["content-type"])
        }
      });
    });

    callbackApp.addHook("onError", async (request, _reply, error) => {
      const callbackType = metaCallbackType(request.url);
      if (!callbackType) return;
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
      if (typeof code !== "string" || !code.startsWith("FST_ERR_CTP_")) return;
      reportMetaCallbackStage({
        callbackType,
        logger: request.log,
        requestId: request.id,
        update: {
          stage: "payload_parse",
          outcome: "failed",
          failureCategory: code === "FST_ERR_CTP_INVALID_MEDIA_TYPE" ? "unsupported_media_type" : "payload_parse_failed"
        }
      });
    });

    callbackApp.post("/v1/meta/deauthorize", { bodyLimit: MAX_META_CALLBACK_BYTES }, async (request, reply) => {
      const report = callbackReporter(request.log, request.id, "deauthorize");
      report({ stage: "payload_parse", outcome: "completed" });
      try {
        const result = await disconnectInstagramFromMetaCallback(request.body, {
          action: "META_DEAUTHORIZE_RECEIVED",
          onStage: report
        });
        report({ stage: "callback_complete", outcome: "completed" });
        return ok(result);
      } catch (error) {
        if (error instanceof MetaCallbackVerificationError) {
          return reply.status(403).send(errorEnvelope("META_CALLBACK_FORBIDDEN", "Meta callback verification failed"));
        }
        throw error;
      }
    });

    callbackApp.post("/v1/meta/data-deletion", { bodyLimit: MAX_META_CALLBACK_BYTES }, async (request, reply) => {
      const report = callbackReporter(request.log, request.id, "data_deletion");
      report({ stage: "payload_parse", outcome: "completed" });
      try {
        const result = await disconnectInstagramFromMetaCallback(request.body, {
          action: "META_DATA_DELETION_RECEIVED",
          onStage: report
        });
        report({ stage: "callback_complete", outcome: "completed" });
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
  });
}

function parseMetaCallbackBody(body: string, contentType: string | string[] | undefined): unknown {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return {};
    }
  }

  const multipartSignedRequest = extractMultipartSignedRequest(body, contentType);
  if (multipartSignedRequest) {
    return { signed_request: multipartSignedRequest };
  }

  const form = Object.fromEntries(new URLSearchParams(body));
  if (typeof form.signed_request === "string" && form.signed_request.length > 0) {
    return form;
  }

  if (isRawSignedRequest(trimmed)) {
    return { signed_request: trimmed };
  }

  return form;
}

function isRawSignedRequest(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 2 && parts.every((part) => /^[A-Za-z0-9_-]+={0,2}$/.test(part));
}

function extractMultipartSignedRequest(
  body: string,
  contentType: string | string[] | undefined
): string | undefined {
  if (classifyMetaCallbackContentType(contentType) !== "multipart") return undefined;

  const boundary = multipartBoundary(contentType);
  if (!boundary) return undefined;

  let signedRequest: string | undefined;
  for (const rawPart of body.split(`--${boundary}`).slice(1)) {
    if (rawPart.startsWith("--")) break;

    const part = rawPart.replace(/^\r?\n/, "");
    const separator = /\r?\n\r?\n/.exec(part);
    if (!separator) continue;

    const headers = part.slice(0, separator.index);
    const disposition = headers
      .split(/\r?\n/)
      .find((line) => /^content-disposition\s*:/i.test(line));
    if (!disposition || multipartPartName(disposition) !== "signed_request") continue;

    const value = part.slice(separator.index + separator[0].length).replace(/\r?\n$/, "").trim();
    if (!value || signedRequest !== undefined) return undefined;
    signedRequest = value;
  }

  return signedRequest;
}

function multipartBoundary(contentType: string | string[] | undefined): string | undefined {
  const value = Array.isArray(contentType) ? contentType[0] : contentType;
  if (!value) return undefined;

  const match = /(?:^|;)\s*boundary=(?:"([^"\r\n]{1,200})"|([^;\r\n]{1,200}))/i.exec(value);
  const boundary = (match?.[1] ?? match?.[2])?.trim();
  if (!boundary || boundary.length > 200) return undefined;
  return boundary;
}

function multipartPartName(contentDisposition: string): string | undefined {
  const match = /(?:^|;)\s*name=(?:"([^"\r\n]*)"|([^;\s\r\n]+))/i.exec(contentDisposition);
  return match?.[1] ?? match?.[2];
}

function metaCallbackType(url: string): MetaCallbackType | undefined {
  const path = url.split("?", 1)[0];
  if (path === "/v1/meta/deauthorize") return "deauthorize";
  if (path === "/v1/meta/data-deletion") return "data_deletion";
  return undefined;
}

function callbackReporter(
  logger: Parameters<typeof reportMetaCallbackStage>[0]["logger"],
  requestId: string,
  callbackType: MetaCallbackType
): (update: MetaCallbackStageUpdate) => void {
  return (update) => reportMetaCallbackStage({ callbackType, logger, requestId, update });
}
