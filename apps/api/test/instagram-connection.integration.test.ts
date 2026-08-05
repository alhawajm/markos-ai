import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { decryptCredential } from "../src/security/credential-encryption";
import { createPrismaOAuthStateStore } from "../src/security/prisma-oauth-state-store";
import {
  completeInstagramOAuth,
  createInstagramOAuthStart,
} from "../src/workspace/instagram-oauth-service";
import {
  InstagramConnectionConflictError,
  disconnectSecureInstagram,
  getDecryptedCredential,
  getSecureInstagramConnection,
  persistInstagramConnection,
  refreshSecureInstagram,
} from "../src/workspace/instagram-connection-service";
import { InstagramBasicClient } from "../src/workspace/instagram-basic-client";
import { describeInstagramDatabase } from "./helpers/instagram-database";

const workspaceIds: string[] = [];
const actorId = randomUUID();
const encryptionKey = process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY ?? "";

describeInstagramDatabase("Instagram encrypted persistence integration", () => {
  beforeAll(async () => {
    if (!encryptionKey)
      throw new Error("INSTAGRAM_TOKEN_ENCRYPTION_KEY is required");
  });
  afterAll(async () => {
    await prisma.oAuthStateNonce.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.auditLog.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.instagramAnalytics.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.contentItem.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.instagramRecentMedia.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.instagramConnectionCredential.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    });
    await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  });

  it("encrypts, reconnects idempotently, blocks active cross-workspace ownership, and releases ownership on disconnect", async () => {
    const first = await workspace();
    const second = await workspace();
    await persist(first, "long-lived-one");
    const stored = await prisma.instagramConnectionCredential.findUniqueOrThrow(
      { where: { workspaceId: first } },
    );
    expect(stored.encryptedAccessToken).not.toContain("long-lived-one");
    expect(decryptCredential(stored.encryptedAccessToken, encryptionKey)).toBe(
      "long-lived-one",
    );
    expect(stored.providerConfirmedScopes).toEqual([]);
    await persist(first, "long-lived-two");
    expect(
      await prisma.instagramConnectionCredential.count({
        where: { workspaceId: first },
      }),
    ).toBe(1);
    await expect(persist(second, "other-workspace")).rejects.toBeInstanceOf(
      InstagramConnectionConflictError,
    );
    await expect(
      disconnectSecureInstagram(first, actorId),
    ).resolves.toMatchObject({
      connection: { connected: false, status: "DISCONNECTED" },
      providerRevocation: {
        status: "ACTION_REQUIRED",
        manualRevocationUrl:
          "https://www.instagram.com/accounts/manage_access/",
      },
    });
    expect(await getDecryptedCredential(first)).toBeNull();
    await expect(persist(first, "same-workspace-again")).resolves.toMatchObject(
      { connected: true },
    );
    await disconnectSecureInstagram(first, actorId);
    await expect(persist(second, "legitimate-transfer")).resolves.toMatchObject(
      { connected: true },
    );
  });

  it("handles refresh eligibility, success, transient failure, expiration, and post-disconnect prevention", async () => {
    const id = await workspace();
    const now = new Date("2026-07-29T12:00:00Z");
    await persist(
      id,
      "current",
      new Date(now.getTime() - 2 * 86_400_000),
      new Date(now.getTime() + 10 * 86_400_000),
      "17841400000000001",
    );
    const transient = new InstagramBasicClient(
      async () => new Response("{}", { status: 503 }),
    );
    await expect(
      refreshSecureInstagram({ workspaceId: id, client: transient, now }),
    ).resolves.toMatchObject({
      refreshed: false,
      reason: "INSTAGRAM_REFRESH_FAILED",
    });
    expect((await getDecryptedCredential(id))?.accessToken).toBe("current");
    const success = new InstagramBasicClient(async () =>
      response({ access_token: "replacement", expires_in: 3600 }),
    );
    await expect(
      refreshSecureInstagram({ workspaceId: id, client: success, now }),
    ).resolves.toMatchObject({ refreshed: true });
    expect((await getDecryptedCredential(id))?.accessToken).toBe("replacement");
    await disconnectSecureInstagram(id, actorId);
    await expect(
      refreshSecureInstagram({ workspaceId: id, client: success, now }),
    ).resolves.toEqual({ refreshed: false, reason: "INSTAGRAM_NOT_CONNECTED" });
  });

  it("requires provider removal, finishes local cleanup, and preserves workspace history", async () => {
    const id = await workspace();
    await persist(
      id,
      "provider-failure-token",
      undefined,
      undefined,
      "17841400000000304",
      [{ id: "retained-history-media", mediaType: "IMAGE" }],
    );
    const content = await prisma.contentItem.create({
      data: {
        workspaceId: id,
        contentType: "POST",
        status: "PUBLISHED",
        captionEn: "Retained workspace content",
        hashtags: ["#markos"],
        mediaIds: [],
        instagramPostId: "published-history-id",
      },
    });
    const analytics = await prisma.instagramAnalytics.create({
      data: {
        workspaceId: id,
        contentItemId: content.id,
        metricType: "POST",
        dataDate: new Date("2026-08-01T00:00:00Z"),
        metrics: { reach: 12 },
        syncedAt: new Date("2026-08-02T00:00:00Z"),
      },
    });
    const stages: Array<{
      stage: string;
      outcome: string;
    }> = [];

    await expect(
      disconnectSecureInstagram(id, actorId, {
        onStage: (update) => stages.push(update),
      }),
    ).resolves.toEqual({
      connection: {
        connected: false,
        status: "DISCONNECTED",
        recentMedia: [],
      },
      providerRevocation: {
        status: "ACTION_REQUIRED",
        manualRevocationUrl:
          "https://www.instagram.com/accounts/manage_access/",
      },
    });
    expect(stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "provider_removal_action",
          outcome: "action_required",
          providerRevocationStatus: "ACTION_REQUIRED",
        }),
        expect.objectContaining({
          stage: "local_cleanup",
          outcome: "completed",
        }),
        expect.objectContaining({
          stage: "disconnect_complete",
          outcome: "completed",
          providerRevocationStatus: "ACTION_REQUIRED",
        }),
      ]),
    );
    expect(
      await prisma.instagramConnectionCredential.findUnique({
        where: { workspaceId: id },
      }),
    ).toBeNull();
    expect(
      await prisma.instagramRecentMedia.count({ where: { workspaceId: id } }),
    ).toBe(0);
    expect(
      await prisma.contentItem.findUnique({ where: { id: content.id } }),
    ).not.toBeNull();
    expect(
      await prisma.instagramAnalytics.findUnique({
        where: { id: analytics.id },
      }),
    ).not.toBeNull();
    expect(
      await prisma.auditLog.findFirst({
        where: { workspaceId: id, action: "INSTAGRAM_DISCONNECTED" },
      }),
    ).toMatchObject({
      metadata: {
        accountId: "17841400000000304",
        providerRevocation: "ACTION_REQUIRED",
      },
    });
  });

  it("enforces application-role RLS for states, credentials, and media", async () => {
    const first = await workspace();
    const second = await workspace();
    await persist(
      first,
      "first-token",
      undefined,
      undefined,
      "17841400000000101",
      [{ id: "media-first", mediaType: "IMAGE" }],
    );
    await persist(
      second,
      "second-token",
      undefined,
      undefined,
      "17841400000000102",
      [{ id: "media-second", mediaType: "VIDEO" }],
    );
    await createPrismaOAuthStateStore(actorId, first).put(
      `first-nonce-${randomUUID()}`,
      new Date(Date.now() + 60_000),
    );
    await createPrismaOAuthStateStore(actorId, second).put(
      `second-nonce-${randomUUID()}`,
      new Date(Date.now() + 60_000),
    );

    const counts = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE markos_app");
      await tx.$executeRaw`SELECT set_config('app.current_workspace', ${first}, true)`;
      const [connections] = await tx.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT count(*) FROM instagram_connection_credentials`;
      const [media] = await tx.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT count(*) FROM instagram_recent_media`;
      const [states] = await tx.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT count(*) FROM oauth_state_nonces`;
      return [
        Number(connections?.count),
        Number(media?.count),
        Number(states?.count),
      ];
    });
    expect(counts).toEqual([1, 1, 1]);

    const firstConnection =
      await prisma.instagramConnectionCredential.findUniqueOrThrow({
        where: { workspaceId: first },
      });
    const secondConnection =
      await prisma.instagramConnectionCredential.findUniqueOrThrow({
        where: { workspaceId: second },
      });
    const secondMedia = await prisma.instagramRecentMedia.findFirstOrThrow({
      where: { workspaceId: second },
    });
    const secondNonce = await prisma.oAuthStateNonce.findFirstOrThrow({
      where: { workspaceId: second },
    });

    for (const statement of [
      `INSERT INTO instagram_connection_credentials (id, "workspaceId", provider, "providerAccountId", username, "encryptedAccessToken", "tokenIssuedAt", "tokenExpiresAt", status, "requestedScopes", "providerConfirmedScopes", "updatedAt") VALUES ('${randomUUID()}', '${second}', 'INSTAGRAM', 'blocked-${randomUUID()}', 'blocked', 'blocked', now(), now() + interval '1 day', 'CONNECTED', ARRAY['instagram_business_basic'], ARRAY[]::text[], now())`,
      `INSERT INTO instagram_recent_media (id, "workspaceId", "connectionId", "providerMediaId", "mediaType") VALUES ('${randomUUID()}', '${second}', '${secondConnection.id}', 'blocked-${randomUUID()}', 'IMAGE')`,
      `INSERT INTO oauth_state_nonces (id, "nonceHash", "workspaceId", "userId", "expiresAt") VALUES ('${randomUUID()}', 'blocked-${randomUUID()}', '${second}', '${actorId}', now() + interval '1 minute')`,
      `UPDATE instagram_connection_credentials SET "workspaceId" = '${second}' WHERE id = '${firstConnection.id}'`,
    ]) {
      await expect(
        asApplicationRole(first, (tx) => tx.$executeRawUnsafe(statement)),
      ).rejects.toThrow();
    }

    expect(
      await asApplicationRole(first, (tx) =>
        tx.$executeRawUnsafe(
          `UPDATE instagram_connection_credentials SET username = 'blocked' WHERE id = '${secondConnection.id}'`,
        ),
      ),
    ).toBe(0);
    expect(
      await asApplicationRole(first, (tx) =>
        tx.$executeRawUnsafe(
          `DELETE FROM instagram_connection_credentials WHERE id = '${secondConnection.id}'`,
        ),
      ),
    ).toBe(0);
    expect(
      await asApplicationRole(first, (tx) =>
        tx.$executeRawUnsafe(
          `DELETE FROM instagram_recent_media WHERE id = '${secondMedia.id}'`,
        ),
      ),
    ).toBe(0);
    expect(
      await asApplicationRole(first, (tx) =>
        tx.$executeRawUnsafe(
          `DELETE FROM oauth_state_nonces WHERE id = '${secondNonce.id}'`,
        ),
      ),
    ).toBe(0);
    expect(
      await asApplicationRole(first, (tx) =>
        tx.$executeRawUnsafe(
          `UPDATE oauth_state_nonces SET "consumedAt" = now() WHERE id = '${secondNonce.id}' AND "consumedAt" IS NULL`,
        ),
      ),
    ).toBe(0);
  });

  it("consumes a nonce atomically and prevents duplicate callback exchange", async () => {
    const id = await workspace();
    const store = createPrismaOAuthStateStore(actorId, id);
    const atomicNonce = `atomic-nonce-${randomUUID()}`;
    await store.put(atomicNonce, new Date(Date.now() + 60_000));
    expect(
      (
        await Promise.all([
          store.consume(atomicNonce),
          store.consume(atomicNonce),
        ])
      ).sort(),
    ).toEqual(["already_consumed", "consumed"]);

    const config = {
      appId: "test-app",
      appSecret: "test-secret",
      redirectUri:
        "http://localhost:4000/v1/workspace/instagram/oauth/callback",
      stateSecret: "test-state-secret-at-least-thirty-two-bytes",
    };
    const start = await createInstagramOAuthStart({
      workspaceId: id,
      userId: actorId,
      returnTo: "/en/app/settings",
      config,
    });
    const state = new URL(start.authorizationUrl).searchParams.get("state")!;
    let exchanges = 0;
    const client = new InstagramBasicClient();
    client.exchangeCode = async () => {
      exchanges += 1;
      return {
        accessToken: "short-only",
        exchangeUserId: "exchange-callback-user",
      };
    };
    client.exchangeLongLived = async () => ({
      accessToken: "long-only",
      expiresIn: 3600,
    });
    client.profile = async () => ({
      professionalAccountId: "17841400000000201",
      username: "callback_account",
      media: [],
    });
    const results = await Promise.allSettled([
      completeInstagramOAuth({ code: "one", state, config, client }),
      completeInstagramOAuth({ code: "one", state, config, client }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(exchanges).toBe(1);
  });

  it.each([
    "database_transaction_begin",
    "connection_upsert",
    "recent_media_delete",
    "recent_media_insert",
    "audit_insert",
    "database_transaction_commit",
    "post_persistence_read",
  ] as const)(
    "classifies and rolls back the %s boundary",
    async (failedStage) => {
      const id = await workspace();
      await expect(
        persistInstagramConnection({
          workspaceId: id,
          actorId,
          accessToken: "never-logged-token",
          issuedAt: new Date("2026-08-03T00:00:00Z"),
          expiresAt: new Date("2026-09-03T00:00:00Z"),
          profile: {
            professionalAccountId: `professional-${randomUUID()}`,
            username: "never_logged_username",
            media: [{ id: "media", mediaType: "IMAGE" }],
          },
          beforeOperation(stage) {
            if (stage === failedStage)
              throw Object.assign(new Error("CANARY_PRISMA_MESSAGE"), {
                code: failedStage === "connection_upsert" ? "P2002" : "EVIL",
                meta: { secret: "CANARY_META" },
              });
          },
        }),
      ).rejects.toMatchObject({ diagnostic: { stage: failedStage } });
      if (failedStage !== "post_persistence_read") {
        expect(
          await prisma.instagramConnectionCredential.findUnique({
            where: { workspaceId: id },
          }),
        ).toBeNull();
        expect(
          await prisma.auditLog.count({
            where: { workspaceId: id, action: "INSTAGRAM_CONNECTED" },
          }),
        ).toBe(0);
      }
    },
  );

  it("enforces concurrent uniqueness and rolls back failed persistence and disconnect", async () => {
    const first = await workspace();
    const second = await workspace();
    const race = await Promise.allSettled([
      persist(first, "race-one", undefined, undefined, "17841400000000301"),
      persist(second, "race-two", undefined, undefined, "17841400000000301"),
    ]);
    expect(race.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(race.filter((result) => result.status === "rejected")).toHaveLength(
      1,
    );

    const rollback = await workspace();
    await expect(
      persist(
        rollback,
        "never-committed",
        undefined,
        undefined,
        "17841400000000302",
        [{ id: "bad-media", mediaType: "IMAGE", timestamp: "not-a-date" }],
      ),
    ).rejects.toThrow();
    expect(
      await prisma.instagramConnectionCredential.findUnique({
        where: { workspaceId: rollback },
      }),
    ).toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { workspaceId: rollback, action: "INSTAGRAM_CONNECTED" },
      }),
    ).toBe(0);

    const disconnectRollback = await workspace();
    await persist(
      disconnectRollback,
      "retained",
      undefined,
      undefined,
      "17841400000000303",
    );
    await prisma.workspace.delete({ where: { id: disconnectRollback } });
    await expect(
      disconnectSecureInstagram(disconnectRollback, actorId),
    ).rejects.toThrow();
    expect(
      await prisma.instagramConnectionCredential.findUnique({
        where: { workspaceId: disconnectRollback },
      }),
    ).not.toBeNull();
  });
});

async function workspace(): Promise<string> {
  const id = randomUUID();
  workspaceIds.push(id);
  await prisma.workspace.create({
    data: {
      id,
      ownerUserId: actorId,
      name: `Instagram test ${id}`,
      slug: `instagram-test-${id}`,
    },
  });
  return id;
}
async function persist(
  workspaceId: string,
  accessToken: string,
  issuedAt = new Date("2026-07-25T00:00:00Z"),
  expiresAt = new Date("2026-09-25T00:00:00Z"),
  providerUserId = "17841400000000000",
  media: Array<{ id: string; mediaType: string; timestamp?: string }> = [],
) {
  return persistInstagramConnection({
    workspaceId,
    actorId,
    accessToken,
    issuedAt,
    expiresAt,
    profile: {
      professionalAccountId: providerUserId,
      username: "markos_business",
      media,
    },
  });
}
function response(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200 });
}
async function asApplicationRole<T>(
  workspaceId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE markos_app");
    await tx.$executeRaw`SELECT set_config('app.current_workspace', ${workspaceId}, true)`;
    return callback(tx);
  });
}
