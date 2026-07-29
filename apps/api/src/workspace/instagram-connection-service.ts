import type { InstagramConnection } from "@markos/shared-types";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { withWorkspaceDbContext } from "../db/workspace-transaction";
import {
  decryptCredential,
  encryptCredential,
} from "../security/credential-encryption";
import type { InstagramBasicProfile } from "./instagram-basic-client";
import {
  InstagramBasicClient,
  InstagramProviderError,
} from "./instagram-basic-client";
import {
  INSTAGRAM_PROVIDER,
  INSTAGRAM_REQUESTED_SCOPES,
} from "./instagram-provider";

export class InstagramConnectionConflictError extends Error {
  constructor() {
    super("Instagram account cannot be connected");
  }
}

export async function persistInstagramConnection(input: {
  workspaceId: string;
  actorId: string;
  profile: InstagramBasicProfile;
  accessToken: string;
  issuedAt: Date;
  expiresAt: Date;
}): Promise<InstagramConnection> {
  const key = requiredKey();
  try {
    await withWorkspaceDbContext(input.workspaceId, async (tx) => {
      const connection = await tx.instagramConnectionCredential.upsert({
        where: { workspaceId: input.workspaceId },
        create: {
          workspaceId: input.workspaceId,
          provider: INSTAGRAM_PROVIDER,
          providerAccountId: input.profile.userId,
          username: input.profile.username,
          accountType: input.profile.accountType ?? null,
          profilePictureUrl: input.profile.profilePictureUrl ?? null,
          encryptedAccessToken: encryptCredential(input.accessToken, key),
          tokenIssuedAt: input.issuedAt,
          tokenExpiresAt: input.expiresAt,
          status: "CONNECTED",
          requestedScopes: [...INSTAGRAM_REQUESTED_SCOPES],
          providerConfirmedScopes: [],
          lastSyncedAt: input.issuedAt,
        },
        update: {
          providerAccountId: input.profile.userId,
          username: input.profile.username,
          accountType: input.profile.accountType ?? null,
          profilePictureUrl: input.profile.profilePictureUrl ?? null,
          encryptedAccessToken: encryptCredential(input.accessToken, key),
          tokenIssuedAt: input.issuedAt,
          tokenExpiresAt: input.expiresAt,
          status: "CONNECTED",
          requestedScopes: [...INSTAGRAM_REQUESTED_SCOPES],
          providerConfirmedScopes: [],
          lastSyncedAt: input.issuedAt,
          lastErrorCode: null,
          deletedAt: null,
        },
      });
      await tx.instagramRecentMedia.deleteMany({
        where: { workspaceId: input.workspaceId },
      });
      if (input.profile.media.length)
        await tx.instagramRecentMedia.createMany({
          data: input.profile.media.slice(0, 6).map((media) => ({
            workspaceId: input.workspaceId,
            connectionId: connection.id,
            providerMediaId: media.id,
            mediaType: media.mediaType,
            caption: media.caption ?? null,
            mediaUrl: media.mediaUrl ?? null,
            thumbnailUrl: media.thumbnailUrl ?? null,
            permalink: media.permalink ?? null,
            providerTimestamp: media.timestamp
              ? new Date(media.timestamp)
              : null,
            syncedAt: input.issuedAt,
          })),
        });
      await tx.auditLog.create({
        data: {
          action: "INSTAGRAM_CONNECTED",
          actorId: input.actorId,
          workspaceId: input.workspaceId,
          targetId: input.profile.userId,
          targetType: "InstagramConnection",
          metadata: {
            username: input.profile.username,
            syncedAt: input.issuedAt.toISOString(),
          },
        },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new InstagramConnectionConflictError();
    throw error;
  }
  return getSecureInstagramConnection(input.workspaceId);
}

export async function getSecureInstagramConnection(
  workspaceId: string,
): Promise<InstagramConnection> {
  return withWorkspaceDbContext(workspaceId, async (tx) => {
    const row = await tx.instagramConnectionCredential.findUnique({
      where: { workspaceId },
    });
    if (!row || row.deletedAt)
      return { connected: false, status: "DISCONNECTED", recentMedia: [] };
    const media = await tx.instagramRecentMedia.findMany({
      where: { workspaceId, connectionId: row.id },
      orderBy: { providerTimestamp: "desc" },
      take: 6,
    });
    const expired = row.tokenExpiresAt <= new Date();
    const status =
      expired || row.status === "EXPIRED"
        ? "REAUTHORIZE_REQUIRED"
        : row.status === "CONNECTED"
          ? "CONNECTED"
          : row.status === "ERROR"
            ? "AUTHORIZATION_FAILED"
            : "CONNECTING";
    return {
      connected: status === "CONNECTED",
      status,
      accountId: row.providerAccountId,
      username: row.username,
      ...(row.accountType ? { accountType: row.accountType } : {}),
      ...(row.profilePictureUrl
        ? { profilePictureUrl: row.profilePictureUrl }
        : {}),
      tokenExpiresAt: row.tokenExpiresAt.toISOString(),
      ...(row.lastSyncedAt
        ? { lastSyncedAt: row.lastSyncedAt.toISOString() }
        : {}),
      recentMedia: media.map((item) => ({
        id: item.providerMediaId,
        mediaType: item.mediaType,
        ...(item.caption ? { caption: item.caption } : {}),
        ...(item.mediaUrl ? { mediaUrl: item.mediaUrl } : {}),
        ...(item.thumbnailUrl ? { thumbnailUrl: item.thumbnailUrl } : {}),
        ...(item.permalink ? { permalink: item.permalink } : {}),
        ...(item.providerTimestamp
          ? { timestamp: item.providerTimestamp.toISOString() }
          : {}),
      })),
    };
  });
}
export async function getDecryptedCredential(workspaceId: string) {
  const row = await withWorkspaceDbContext(workspaceId, (tx) =>
    tx.instagramConnectionCredential.findUnique({ where: { workspaceId } }),
  );
  if (!row || row.deletedAt || row.status !== "CONNECTED") return null;
  return {
    ...row,
    accessToken: decryptCredential(row.encryptedAccessToken, requiredKey()),
  };
}

export async function disconnectSecureInstagram(
  workspaceId: string,
  actorId: string,
): Promise<InstagramConnection> {
  await withWorkspaceDbContext(workspaceId, async (tx) => {
    await tx.instagramRecentMedia.deleteMany({ where: { workspaceId } });
    await tx.instagramConnectionCredential.deleteMany({
      where: { workspaceId },
    });
    await tx.workspace.update({
      where: { id: workspaceId },
      data: {
        instagramAccessToken: null,
        instagramAccountId: null,
        instagramTokenExpiresAt: null,
      },
    });
    await tx.auditLog.create({
      data: {
        action: "INSTAGRAM_DISCONNECTED",
        actorId,
        workspaceId,
        targetType: "InstagramConnection",
      },
    });
  });
  return { connected: false, status: "DISCONNECTED", recentMedia: [] };
}
export async function refreshSecureInstagram(input: {
  workspaceId: string;
  client?: InstagramBasicClient;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const credential = await getDecryptedCredential(input.workspaceId);
  if (!credential)
    return { refreshed: false, reason: "INSTAGRAM_NOT_CONNECTED" };
  if (credential.tokenExpiresAt <= now) {
    await updateConnection(input.workspaceId, {
      where: { workspaceId: input.workspaceId },
      data: { status: "EXPIRED", lastErrorCode: "TOKEN_EXPIRED" },
    });
    return {
      refreshed: false,
      reason: "INSTAGRAM_REAUTHORIZATION_REQUIRED",
      connection: await getSecureInstagramConnection(input.workspaceId),
    };
  }
  if (now.getTime() - credential.tokenIssuedAt.getTime() < 24 * 60 * 60 * 1000)
    return {
      refreshed: false,
      reason: "INSTAGRAM_TOKEN_TOO_NEW",
      connection: await getSecureInstagramConnection(input.workspaceId),
    };
  try {
    const result = await (input.client ?? new InstagramBasicClient()).refresh(
      credential.accessToken,
    );
    await updateConnection(input.workspaceId, {
      where: { workspaceId: input.workspaceId },
      data: {
        encryptedAccessToken: encryptCredential(
          result.accessToken,
          requiredKey(),
        ),
        tokenIssuedAt: now,
        tokenExpiresAt: new Date(now.getTime() + result.expiresIn * 1000),
        status: "CONNECTED",
        lastErrorCode: null,
      },
    });
    return {
      refreshed: true,
      connection: await getSecureInstagramConnection(input.workspaceId),
    };
  } catch (error) {
    if (error instanceof InstagramProviderError && error.authorizationInvalid)
      await updateConnection(input.workspaceId, {
        where: { workspaceId: input.workspaceId },
        data: { status: "EXPIRED", lastErrorCode: "AUTHORIZATION_INVALID" },
      });
    return {
      refreshed: false,
      reason:
        error instanceof InstagramProviderError && error.authorizationInvalid
          ? "INSTAGRAM_REAUTHORIZATION_REQUIRED"
          : "INSTAGRAM_REFRESH_FAILED",
      connection: await getSecureInstagramConnection(input.workspaceId),
    };
  }
}

async function updateConnection(
  workspaceId: string,
  args: Parameters<typeof prisma.instagramConnectionCredential.update>[0],
) {
  return withWorkspaceDbContext(workspaceId, (tx) =>
    tx.instagramConnectionCredential.update(args),
  );
}

function requiredKey(): string {
  if (!env.INSTAGRAM_TOKEN_ENCRYPTION_KEY)
    throw new Error("Instagram credential storage is not configured");
  return env.INSTAGRAM_TOKEN_ENCRYPTION_KEY;
}
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
