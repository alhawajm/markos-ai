import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import type { MetaCallbackStageUpdate } from "./meta-callback-telemetry";

export interface MetaCallbackResult {
  accountId?: string;
  disconnected: number;
  received: true;
}

export interface MetaWebhookEventResult {
  received: true;
}

interface SignedRequestPayload {
  user_id?: string | number;
}

export class MetaCallbackVerificationError extends Error {
  constructor() {
    super("Meta callback verification failed");
  }
}

export function verifyInstagramWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!env.INSTAGRAM_APP_SECRET || !signatureHeader?.startsWith("sha256=")) return false;

  const suppliedHex = signatureHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;

  const supplied = Buffer.from(suppliedHex, "hex");
  const expected = createHmac("sha256", env.INSTAGRAM_APP_SECRET).update(rawBody).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function createDataDeletionConfirmationCode(): string {
  return randomUUID();
}

export async function recordInstagramWebhookEvent(body: unknown): Promise<MetaWebhookEventResult> {
  await prisma.auditLog.create({
    data: {
      action: "META_INSTAGRAM_WEBHOOK_RECEIVED",
      metadata: sanitizeMetaPayload(body),
      targetType: "MetaWebhook"
    }
  });

  return {
    received: true
  };
}

export async function disconnectInstagramFromMetaCallback(
  body: unknown,
  input: {
    action?: "META_DATA_DELETION_RECEIVED" | "META_DEAUTHORIZE_RECEIVED";
    onStage?: (update: MetaCallbackStageUpdate) => void;
  } = {}
): Promise<MetaCallbackResult> {
  const report = (update: MetaCallbackStageUpdate) => {
    try {
      input.onStage?.(update);
    } catch {
      /* diagnostics cannot change callback behavior */
    }
  };
  report({ stage: "signature_verification", outcome: "started" });
  let accountId: string | undefined;
  try {
    accountId = getVerifiedAccountId(body);
  } catch (error) {
    report({ stage: "signature_verification", outcome: "rejected", failureCategory: "signature_verification_failed" });
    throw error;
  }
  report({ stage: "signature_verification", outcome: "completed" });
  const action = input.action ?? "META_DEAUTHORIZE_RECEIVED";

  if (!accountId) {
    await recordMetaCallbackAudit({
      action,
      body,
      disconnected: 0
    });

    return {
      disconnected: 0,
      received: true
    };
  }

  report({ stage: "credential_lookup", outcome: "started" });
  let matchingConnections: Array<{ workspaceId: string }>;
  try {
    matchingConnections = await prisma.instagramConnectionCredential.findMany({
      select: {
        workspaceId: true
      },
      where: {
        deletedAt: null,
        provider: "INSTAGRAM",
        providerAccountId: accountId
      }
    });
  } catch (error) {
    report({ stage: "credential_lookup", outcome: "failed", failureCategory: "database_failure" });
    throw error;
  }
  const workspaceIds = matchingConnections.map((connection) => connection.workspaceId);
  report({ stage: "credential_lookup", outcome: "completed", credentialMatched: workspaceIds.length > 0 });

  report({ stage: "local_cleanup", outcome: "started" });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.instagramRecentMedia.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await tx.instagramConnectionCredential.deleteMany({
        where: { workspaceId: { in: workspaceIds }, providerAccountId: accountId }
      });
      await tx.workspace.updateMany({
        data: { instagramAccessToken: null, instagramAccountId: null, instagramTokenExpiresAt: null },
        where: { id: { in: workspaceIds } }
      });
    });
  } catch (error) {
    report({ stage: "local_cleanup", outcome: "failed", failureCategory: "database_failure" });
    throw error;
  }
  report({ stage: "local_cleanup", outcome: "completed" });

  report({ stage: "audit_persistence", outcome: "started" });
  try {
    await recordMetaCallbackAudit({
      accountId,
      action,
      body,
      disconnected: workspaceIds.length,
      workspaceIds
    });
  } catch (error) {
    report({ stage: "audit_persistence", outcome: "failed", failureCategory: "database_failure" });
    throw error;
  }
  report({ stage: "audit_persistence", outcome: "completed" });

  return {
    accountId,
    disconnected: workspaceIds.length,
    received: true
  };
}

async function recordMetaCallbackAudit(input: {
  accountId?: string;
  action: "META_DATA_DELETION_RECEIVED" | "META_DEAUTHORIZE_RECEIVED";
  body: unknown;
  disconnected: number;
  workspaceIds?: string[];
}): Promise<void> {
  const workspaceIds = input.workspaceIds ?? [];

  if (workspaceIds.length === 0) {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        metadata: callbackMetadata(input),
        targetId: input.accountId ?? null,
        targetType: "InstagramConnection"
      }
    });
    return;
  }

  await prisma.auditLog.createMany({
    data: workspaceIds.map((workspaceId) => ({
      action: input.action,
      metadata: callbackMetadata(input),
      targetId: input.accountId ?? null,
      targetType: "InstagramConnection",
      workspaceId
    }))
  });
}

function callbackMetadata(input: {
  accountId?: string;
  body: unknown;
  disconnected: number;
}): Prisma.InputJsonObject {
  return {
    ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
    disconnected: input.disconnected,
    payload: sanitizeMetaPayload(input.body)
  };
}

function sanitizeMetaPayload(body: unknown): Prisma.InputJsonObject {
  if (typeof body !== "object" || body === null) {
    return {
      payloadType: typeof body
    };
  }

  const record = body as Record<string, unknown>;
  const sanitized: Record<string, Prisma.InputJsonValue> = {};

  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase().includes("token") || key === "signed_request") {
      sanitized[key] = "[redacted]";
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      sanitized[key] = {
        itemCount: value.length
      };
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = {
        objectKeys: Object.keys(value as Record<string, unknown>)
      };
    }
  }

  return sanitized;
}

function getVerifiedAccountId(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) {
    throw new MetaCallbackVerificationError();
  }

  const record = body as Record<string, unknown>;
  const signedRequest = typeof record.signed_request === "string" ? record.signed_request : undefined;
  const payload = signedRequest ? parseSignedRequest(signedRequest) : undefined;
  const accountId = firstString(payload?.user_id);

  if (!accountId) throw new MetaCallbackVerificationError();

  return accountId;
}

function parseSignedRequest(signedRequest: string): SignedRequestPayload | undefined {
  if (!env.INSTAGRAM_APP_SECRET) {
    return undefined;
  }

  const [encodedSignature, encodedPayload] = signedRequest.split(".");

  if (!encodedSignature || !encodedPayload) {
    return undefined;
  }

  const signature = base64UrlDecode(encodedSignature);
  const expected = createHmac("sha256", env.INSTAGRAM_APP_SECRET).update(encodedPayload).digest();

  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    return undefined;
  }

  try {
    return JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as SignedRequestPayload;
  } catch {
    return undefined;
  }
}

function base64UrlDecode(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");

  return Buffer.from(padded, "base64");
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return undefined;
}
