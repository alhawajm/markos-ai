import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";
import { prisma } from "../db/prisma";

export interface MetaCallbackResult {
  accountId?: string;
  disconnected: number;
  received: true;
}

interface SignedRequestPayload {
  user_id?: string | number;
}

export async function disconnectInstagramFromMetaCallback(body: unknown): Promise<MetaCallbackResult> {
  const accountId = getAccountId(body);

  if (!accountId) {
    return {
      disconnected: 0,
      received: true
    };
  }

  const result = await prisma.workspace.updateMany({
    data: {
      instagramAccessToken: null,
      instagramAccountId: null,
      instagramTokenExpiresAt: null
    },
    where: {
      deletedAt: null,
      instagramAccountId: accountId
    }
  });

  return {
    accountId,
    disconnected: result.count,
    received: true
  };
}

function getAccountId(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }

  const record = body as Record<string, unknown>;
  const direct = firstString(record.instagram_account_id, record.account_id, record.user_id);

  if (direct) {
    return direct;
  }

  const signedRequest = typeof record.signed_request === "string" ? record.signed_request : undefined;
  const payload = signedRequest ? parseSignedRequest(signedRequest) : undefined;

  return firstString(payload?.user_id);
}

function parseSignedRequest(signedRequest: string): SignedRequestPayload | undefined {
  if (!env.META_APP_SECRET) {
    return undefined;
  }

  const [encodedSignature, encodedPayload] = signedRequest.split(".");

  if (!encodedSignature || !encodedPayload) {
    return undefined;
  }

  const signature = base64UrlDecode(encodedSignature);
  const expected = createHmac("sha256", env.META_APP_SECRET).update(encodedPayload).digest();

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
