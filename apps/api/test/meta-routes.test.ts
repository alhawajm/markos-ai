import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { env } from "../src/config/env";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { persistTestInstagramConnection } from "./helpers/instagram-connection";

describe("Meta callback routes", () => {
  it("verifies Instagram webhook subscriptions with the configured challenge token", async () => {
    env.META_WEBHOOK_VERIFY_TOKEN = "verify-token";
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/meta/webhooks/instagram?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-value"
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("challenge-value");

    await app.close();
  });

  it("rejects Instagram webhook verification with the wrong token", async () => {
    env.META_WEBHOOK_VERIFY_TOKEN = "verify-token";
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/meta/webhooks/instagram?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-value"
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("META_WEBHOOK_FORBIDDEN");

    await app.close();
  });

  it("disconnects matching Instagram credentials from Meta callbacks", async () => {
    env.INSTAGRAM_APP_SECRET = "test-instagram-app-secret";
    const app = await buildApp();
    const session = await registerTestUser(app);
    const accountId = `meta-${randomUUID()}`;
    await persistTestInstagramConnection({ workspaceId: session.workspace.id, actorId: session.user.id, accountId, accessToken: "connected-token" });

    const deauthorizeSignedRequest = signedRequest(accountId);
    const deauthorize = await app.inject({
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
      payload: `signed_request=${encodeURIComponent(deauthorizeSignedRequest)}`,
      url: "/v1/meta/deauthorize"
    });
    const workspaceAfterDeauthorize = await prisma.workspace.findUniqueOrThrow({
      select: {
        instagramAccessToken: true,
        instagramAccountId: true,
        instagramTokenExpiresAt: true
      },
      where: {
        id: session.workspace.id
      }
    });
    const deauthorizeAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "META_DEAUTHORIZE_RECEIVED",
        workspaceId: session.workspace.id
      }
    });
    expect(await prisma.instagramConnectionCredential.findUnique({ where: { workspaceId: session.workspace.id } })).toBeNull();

    await persistTestInstagramConnection({ workspaceId: session.workspace.id, actorId: session.user.id, accountId, accessToken: "connected-token" });
    const deletionSignedRequest = signedRequest(accountId);
    const deletion = await app.inject({
      headers: { "content-type": "application/octet-stream" },
      method: "POST",
      payload: `signed_request=${encodeURIComponent(deletionSignedRequest)}`,
      url: "/v1/meta/data-deletion"
    });
    const workspaceAfterDeletion = await prisma.workspace.findUniqueOrThrow({
      select: {
        instagramAccessToken: true,
        instagramAccountId: true,
        instagramTokenExpiresAt: true
      },
      where: {
        id: session.workspace.id
      }
    });
    const deletionAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "META_DATA_DELETION_RECEIVED",
        workspaceId: session.workspace.id
      }
    });
    expect(await prisma.instagramConnectionCredential.findUnique({ where: { workspaceId: session.workspace.id } })).toBeNull();

    expect(deauthorize.statusCode).toBe(200);
    expect(deauthorize.json().data.received).toBe(true);
    expect(deauthorize.json().data.disconnected).toBe(1);
    expect(workspaceAfterDeauthorize.instagramAccountId).toBeNull();
    expect(workspaceAfterDeauthorize.instagramAccessToken).toBeNull();
    expect(workspaceAfterDeauthorize.instagramTokenExpiresAt).toBeNull();
    expect(deauthorizeAudit.targetId).toBe(accountId);
    expect(deauthorizeAudit.targetType).toBe("InstagramConnection");
    expect(deauthorizeAudit.metadata).toMatchObject({
      accountId,
      disconnected: 1,
      payload: {
        signed_request: "[redacted]"
      }
    });
    expect(deletion.statusCode).toBe(200);
    expect(deletion.json().disconnected).toBe(1);
    expect(deletion.json().confirmation_code).toMatch(/^[0-9a-f-]{36}$/);
    expect(deletion.json().url).toContain("/en/app/settings?dataDeletion=received");
    expect(workspaceAfterDeletion.instagramAccountId).toBeNull();
    expect(workspaceAfterDeletion.instagramAccessToken).toBeNull();
    expect(workspaceAfterDeletion.instagramTokenExpiresAt).toBeNull();
    expect(deletionAudit.targetId).toBe(accountId);
    expect(deletionAudit.targetType).toBe("InstagramConnection");

    await app.close();
  });

  it("accepts a raw signed deauthorization envelope and rejects a tampered signature", async () => {
    env.INSTAGRAM_APP_SECRET = "test-instagram-app-secret";
    const app = await buildApp();
    const session = await registerTestUser(app);
    const accountId = `meta-raw-${randomUUID()}`;
    await persistTestInstagramConnection({
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      accountId,
      accessToken: "connected-token"
    });

    const validSignedRequest = signedRequest(accountId);
    const validResponse = await app.inject({
      headers: { "content-type": "application/octet-stream" },
      method: "POST",
      payload: validSignedRequest,
      url: "/v1/meta/deauthorize"
    });

    expect(validResponse.statusCode).toBe(200);
    expect(validResponse.json().data).toMatchObject({ disconnected: 1, received: true });
    expect(
      await prisma.instagramConnectionCredential.findUnique({ where: { workspaceId: session.workspace.id } })
    ).toBeNull();

    await persistTestInstagramConnection({
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      accountId,
      accessToken: "connected-token"
    });
    const tamperedSignedRequest = tamperSignature(validSignedRequest);
    const tamperedResponse = await app.inject({
      headers: { "content-type": "application/octet-stream" },
      method: "POST",
      payload: tamperedSignedRequest,
      url: "/v1/meta/deauthorize"
    });

    expect(tamperedResponse.statusCode).toBe(403);
    expect(tamperedResponse.json().error.code).toBe("META_CALLBACK_FORBIDDEN");
    expect(
      await prisma.instagramConnectionCredential.findUnique({ where: { workspaceId: session.workspace.id } })
    ).not.toBeNull();

    await app.close();
  });

  it("records Instagram webhook events with sanitized payload metadata", async () => {
    env.INSTAGRAM_APP_SECRET = "test-instagram-app-secret";
    const app = await buildApp();
    const payload = JSON.stringify({
      access_token: "secret-token",
      entry: [{ changes: [{ field: "comments" }] }],
      object: "instagram",
      signed_request: "signed.secret"
    });

    const response = await app.inject({
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": webhookSignature(payload)
      },
      method: "POST",
      payload,
      url: "/v1/meta/webhooks/instagram"
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      orderBy: {
        createdAt: "desc"
      },
      where: {
        action: "META_INSTAGRAM_WEBHOOK_RECEIVED"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.received).toBe(true);
    expect(audit.targetType).toBe("MetaWebhook");
    expect(audit.metadata).toMatchObject({
      access_token: "[redacted]",
      entry: {
        itemCount: 1
      },
      object: "instagram",
      signed_request: "[redacted]"
    });

    await app.close();
  });

  it("rejects unsigned webhooks and destructive callbacks without changing credentials", async () => {
    env.INSTAGRAM_APP_SECRET = "test-instagram-app-secret";
    const app = await buildApp();
    const accountId = `meta-${randomUUID()}`;

    const webhook = await app.inject({ method: "POST", payload: { object: "instagram" }, url: "/v1/meta/webhooks/instagram" });
    const callback = await app.inject({ method: "POST", payload: { account_id: accountId }, url: "/v1/meta/deauthorize" });

    expect(webhook.statusCode).toBe(403);
    expect(callback.statusCode).toBe(403);
    await app.close();
  });
});

function signedRequest(accountId: string): string {
  const payload = Buffer.from(JSON.stringify({ user_id: accountId })).toString("base64url");
  const signature = createHmac("sha256", env.INSTAGRAM_APP_SECRET!).update(payload).digest("base64url");
  return `${signature}.${payload}`;
}

function tamperSignature(value: string): string {
  const [signature, payload] = value.split(".") as [string, string];
  const replacement = signature.startsWith("A") ? "B" : "A";
  return `${replacement}${signature.slice(1)}.${payload}`;
}

function webhookSignature(payload: string): string {
  return `sha256=${createHmac("sha256", env.INSTAGRAM_APP_SECRET!).update(payload).digest("hex")}`;
}

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = `meta-callback-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    payload: {
      email,
      fullName: "Meta Callback User",
      locale: "en",
      password: "CorrectHorseBattery99!",
      workspaceName: `Meta Callback ${randomUUID()}`
    },
    url: "/v1/auth/register"
  });

  const session = response.json().data;

  await prisma.user.update({
    data: {
      isVerified: true
    },
    where: {
      id: session.user.id
    }
  });

  return {
    ...session,
    user: {
      ...session.user,
      isVerified: true
    }
  };
}
