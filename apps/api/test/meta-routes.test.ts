import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { env } from "../src/config/env";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

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
    const app = await buildApp();
    const session = await registerTestUser(app);
    const accountId = `meta-${randomUUID()}`;
    await prisma.workspace.update({
      data: {
        instagramAccessToken: "connected-token",
        instagramAccountId: accountId,
        instagramTokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
      },
      where: {
        id: session.workspace.id
      }
    });

    const deauthorize = await app.inject({
      method: "POST",
      payload: {
        account_id: accountId
      },
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

    await prisma.workspace.update({
      data: {
        instagramAccessToken: "connected-token",
        instagramAccountId: accountId,
        instagramTokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
      },
      where: {
        id: session.workspace.id
      }
    });
    const deletion = await app.inject({
      method: "POST",
      payload: {
        account_id: accountId
      },
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

    expect(deauthorize.statusCode).toBe(200);
    expect(deauthorize.json().data.received).toBe(true);
    expect(deauthorize.json().data.disconnected).toBe(1);
    expect(workspaceAfterDeauthorize.instagramAccountId).toBeNull();
    expect(workspaceAfterDeauthorize.instagramAccessToken).toBeNull();
    expect(workspaceAfterDeauthorize.instagramTokenExpiresAt).toBeNull();
    expect(deletion.statusCode).toBe(200);
    expect(deletion.json()).toMatchObject({
      confirmation_code: "markos-meta-deletion-received",
      disconnected: 1
    });
    expect(workspaceAfterDeletion.instagramAccountId).toBeNull();
    expect(workspaceAfterDeletion.instagramAccessToken).toBeNull();
    expect(workspaceAfterDeletion.instagramTokenExpiresAt).toBeNull();

    await app.close();
  });
});

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

  return response.json().data;
}
