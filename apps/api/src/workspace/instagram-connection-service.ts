import type { Workspace } from "@prisma/client";
import type { InstagramConnection, InstagramDisconnectResult } from "@markos/shared-types";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { withWorkspaceDbContext } from "../db/workspace-transaction";
import { decodeEncryptionKey, decryptCredential, encryptCredential } from "../security/credential-encryption";
import type { InstagramBasicProfile } from "./instagram-basic-client";
import { InstagramBasicClient, InstagramProviderError } from "./instagram-basic-client";
import { INSTAGRAM_PROVIDER, INSTAGRAM_MANAGE_ACCESS_URL, INSTAGRAM_REQUESTED_SCOPES } from "./instagram-provider";
import {
  classifyDatabaseFailure,
  InstagramOAuthDiagnosticError,
  type InstagramDisconnectStageUpdate,
  type InstagramOAuthFailureStage
} from "./instagram-oauth-telemetry";

export class InstagramConnectionConflictError extends InstagramOAuthDiagnosticError {
  constructor() {
    super({
      stage: "connection_upsert",
      category: "database_unique_constraint",
      retryable: false,
      databaseCode: "P2002"
    });
  }
}

export async function persistInstagramConnection(input: {
  workspaceId: string;
  actorId: string;
  profile: InstagramBasicProfile;
  accessToken: string;
  issuedAt: Date;
  expiresAt: Date;
  /** Test-only fault boundary; production callers must omit it. */
  beforeOperation?: (stage: InstagramOAuthFailureStage) => void;
  /** Test-only configuration boundary; production callers must omit it. */
  encryptionKeyOverride?: string | null;
}): Promise<InstagramConnection> {
  const stage = (value: InstagramOAuthFailureStage) => input.beforeOperation?.(value);
  stage("credential_configuration");
  const key = requiredKeyForOAuth(input.encryptionKeyOverride);
  try {
    decodeEncryptionKey(key);
  } catch (error) {
    throw new InstagramOAuthDiagnosticError(
      {
        stage: "credential_configuration",
        category: "encryption_key_invalid",
        retryable: false
      },
      error
    );
  }
  let encryptedAccessToken: string;
  let mediaRows;
  try {
    stage("credential_serialization");
    mediaRows = input.profile.media.slice(0, 6).map((media) => ({
      workspaceId: input.workspaceId,
      providerMediaId: media.id,
      mediaType: media.mediaType,
      caption: media.caption ?? null,
      mediaUrl: media.mediaUrl ?? null,
      thumbnailUrl: media.thumbnailUrl ?? null,
      permalink: media.permalink ?? null,
      providerTimestamp: media.timestamp ? new Date(media.timestamp) : null,
      syncedAt: input.issuedAt
    }));
    if (mediaRows.some((row) => row.providerTimestamp && Number.isNaN(row.providerTimestamp.getTime()))) throw new Error("invalid provider timestamp");
  } catch (error) {
    throw diagnostic("credential_serialization", "credential_serialization_failed", false, error);
  }
  try {
    stage("credential_encryption");
    encryptedAccessToken = encryptCredential(input.accessToken, key);
  } catch (error) {
    throw diagnostic("credential_encryption", "credential_encryption_failed", false, error);
  }
  let activeStage: InstagramOAuthFailureStage = "database_transaction_begin";
  try {
    stage(activeStage);
    await withWorkspaceDbContext(input.workspaceId, async (tx) => {
      activeStage = "connection_upsert";
      stage(activeStage);
      const connection = await tx.instagramConnectionCredential.upsert({
        where: { workspaceId: input.workspaceId },
        create: {
          workspaceId: input.workspaceId,
          provider: INSTAGRAM_PROVIDER,
          providerAccountId: input.profile.professionalAccountId,
          username: input.profile.username,
          accountType: input.profile.accountType ?? null,
          profilePictureUrl: input.profile.profilePictureUrl ?? null,
          encryptedAccessToken,
          tokenIssuedAt: input.issuedAt,
          tokenExpiresAt: input.expiresAt,
          status: "CONNECTED",
          requestedScopes: [...INSTAGRAM_REQUESTED_SCOPES],
          providerConfirmedScopes: [],
          lastSyncedAt: input.issuedAt
        },
        update: {
          providerAccountId: input.profile.professionalAccountId,
          username: input.profile.username,
          accountType: input.profile.accountType ?? null,
          profilePictureUrl: input.profile.profilePictureUrl ?? null,
          encryptedAccessToken,
          tokenIssuedAt: input.issuedAt,
          tokenExpiresAt: input.expiresAt,
          status: "CONNECTED",
          requestedScopes: [...INSTAGRAM_REQUESTED_SCOPES],
          providerConfirmedScopes: [],
          lastSyncedAt: input.issuedAt,
          lastErrorCode: null,
          deletedAt: null
        }
      });
      activeStage = "recent_media_delete";
      stage(activeStage);
      await tx.instagramRecentMedia.deleteMany({
        where: { workspaceId: input.workspaceId }
      });
      if (mediaRows.length) {
        activeStage = "recent_media_insert";
        stage(activeStage);
        await tx.instagramRecentMedia.createMany({
          data: mediaRows.map((media) => ({
            ...media,
            connectionId: connection.id
          }))
        });
      }
      activeStage = "audit_insert";
      stage(activeStage);
      await tx.auditLog.create({
        data: {
          action: "INSTAGRAM_CONNECTED",
          actorId: input.actorId,
          workspaceId: input.workspaceId,
          targetId: input.profile.professionalAccountId,
          targetType: "InstagramConnection",
          metadata: {
            username: input.profile.username,
            syncedAt: input.issuedAt.toISOString()
          }
        }
      });
      activeStage = "database_transaction_commit";
      stage(activeStage);
    });
  } catch (error) {
    if (error instanceof InstagramOAuthDiagnosticError) throw error;
    if (isUniqueViolation(error)) throw new InstagramConnectionConflictError();
    throw new InstagramOAuthDiagnosticError({ stage: activeStage, ...classifyDatabaseFailure(error) }, error);
  }
  try {
    stage("post_persistence_read");
    return await getSecureInstagramConnection(input.workspaceId);
  } catch (error) {
    if (error instanceof InstagramOAuthDiagnosticError)
      throw new InstagramOAuthDiagnosticError(
        {
          ...error.diagnostic,
          stage: error.diagnostic.stage === "connection_status_transformation" ? "connection_status_transformation" : "post_persistence_read"
        },
        error
      );
    throw diagnostic("post_persistence_read", "post_persistence_read_failed", true, error);
  }
}

export async function getSecureInstagramConnection(workspaceId: string): Promise<InstagramConnection> {
  let row;
  let media;
  try {
    ({ row, media } = await withWorkspaceDbContext(workspaceId, async (tx) => {
      const row = await tx.instagramConnectionCredential.findUnique({
        where: { workspaceId }
      });
      if (!row) return { row, media: [] };
      const media = await tx.instagramRecentMedia.findMany({
        where: { workspaceId, connectionId: row.id },
        orderBy: { providerTimestamp: "desc" },
        take: 6
      });
      return { row, media };
    }));
  } catch (error) {
    throw new InstagramOAuthDiagnosticError({ stage: "connection_status_read", ...classifyDatabaseFailure(error) }, error);
  }
  try {
    if (!row || row.deletedAt) return { connected: false, status: "DISCONNECTED", recentMedia: [] };
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
      ...(row.profilePictureUrl ? { profilePictureUrl: row.profilePictureUrl } : {}),
      tokenExpiresAt: row.tokenExpiresAt.toISOString(),
      ...(row.lastSyncedAt ? { lastSyncedAt: row.lastSyncedAt.toISOString() } : {}),
      recentMedia: media.map((item) => ({
        id: item.providerMediaId,
        mediaType: item.mediaType,
        ...(item.caption ? { caption: item.caption } : {}),
        ...(item.mediaUrl ? { mediaUrl: item.mediaUrl } : {}),
        ...(item.thumbnailUrl ? { thumbnailUrl: item.thumbnailUrl } : {}),
        ...(item.permalink ? { permalink: item.permalink } : {}),
        ...(item.providerTimestamp ? { timestamp: item.providerTimestamp.toISOString() } : {})
      }))
    };
  } catch (error) {
    throw diagnostic("connection_status_transformation", "connection_status_transformation_failed", false, error);
  }
}
export async function getDecryptedCredential(workspaceId: string) {
  const row = await withWorkspaceDbContext(workspaceId, (tx) => tx.instagramConnectionCredential.findUnique({ where: { workspaceId } }));
  if (!row || row.deletedAt || row.status !== "CONNECTED") return null;
  return {
    ...row,
    accessToken: decryptCredential(row.encryptedAccessToken, requiredKey())
  };
}

/** Loads the secure credential and exposes it only to the authorized provider-call boundary. */
export async function withSecureInstagramCredential(workspace: Workspace): Promise<Workspace> {
  const credential = await getDecryptedCredential(workspace.id);
  return {
    ...workspace,
    instagramAccountId: credential?.providerAccountId ?? null,
    instagramAccessToken: credential?.accessToken ?? null,
    instagramTokenExpiresAt: credential?.tokenExpiresAt ?? null
  };
}

export async function disconnectSecureInstagram(
  workspaceId: string,
  actorId: string,
  options: {
    onStage?: (update: InstagramDisconnectStageUpdate) => void;
  } = {}
): Promise<InstagramDisconnectResult> {
  const report = (update: InstagramDisconnectStageUpdate) => {
    try {
      options.onStage?.(update);
    } catch {
      /* diagnostics cannot change disconnect behavior */
    }
  };
  report({ stage: "disconnect_request", outcome: "started" });
  report({ stage: "credential_lookup", outcome: "started" });

  let storedCredential: { workspaceId: string } | null;
  try {
    storedCredential = await withWorkspaceDbContext(workspaceId, (tx) =>
      tx.instagramConnectionCredential.findUnique({
        where: { workspaceId },
        select: {
          workspaceId: true
        }
      })
    );
  } catch (error) {
    report({
      stage: "credential_lookup",
      outcome: "failed",
      diagnostic: {
        stage: "disconnect_credential_read",
        ...classifyDatabaseFailure(error)
      }
    });
    throw error;
  }
  report({
    stage: "credential_lookup",
    outcome: "completed",
    credentialFound: storedCredential !== null
  });

  let providerRevocation: InstagramDisconnectResult["providerRevocation"] = {
    status: "NOT_APPLICABLE"
  };
  if (storedCredential) {
    providerRevocation = {
      status: "ACTION_REQUIRED",
      manualRevocationUrl: INSTAGRAM_MANAGE_ACCESS_URL
    };
    report({
      stage: "provider_removal_action",
      outcome: "action_required",
      providerRevocationStatus: "ACTION_REQUIRED"
    });
  } else {
    report({
      stage: "provider_removal_action",
      outcome: "skipped",
      providerRevocationStatus: "NOT_APPLICABLE"
    });
  }

  report({ stage: "local_cleanup", outcome: "started" });
  try {
    await withWorkspaceDbContext(workspaceId, async (tx) => {
      const connection = await tx.instagramConnectionCredential.findUnique({
        where: { workspaceId },
        select: { providerAccountId: true }
      });
      await tx.instagramRecentMedia.deleteMany({ where: { workspaceId } });
      await tx.instagramConnectionCredential.deleteMany({
        where: { workspaceId }
      });
      await tx.workspace.update({
        where: { id: workspaceId },
        data: {
          instagramAccessToken: null,
          instagramAccountId: null,
          instagramTokenExpiresAt: null
        }
      });
      await tx.auditLog.create({
        data: {
          action: "INSTAGRAM_DISCONNECTED",
          actorId,
          workspaceId,
          targetId: connection?.providerAccountId ?? null,
          targetType: "InstagramConnection",
          metadata: {
            ...(connection ? { accountId: connection.providerAccountId } : {}),
            providerRevocation: providerRevocation.status
          }
        }
      });
    });
  } catch (error) {
    report({
      stage: "local_cleanup",
      outcome: "failed",
      diagnostic: {
        stage: "disconnect_local_cleanup",
        ...classifyDatabaseFailure(error)
      }
    });
    throw error;
  }
  report({ stage: "local_cleanup", outcome: "completed" });
  report({
    stage: "disconnect_complete",
    outcome: "completed",
    providerRevocationStatus: providerRevocation.status
  });
  return {
    connection: {
      connected: false,
      status: "DISCONNECTED",
      recentMedia: []
    },
    providerRevocation
  };
}
export async function refreshSecureInstagram(input: { workspaceId: string; actorId?: string; client?: InstagramBasicClient; now?: Date }) {
  const now = input.now ?? new Date();
  const credential = await getDecryptedCredential(input.workspaceId);
  if (!credential) return { refreshed: false, reason: "INSTAGRAM_NOT_CONNECTED" };
  if (credential.tokenExpiresAt <= now) {
    await updateConnection(input.workspaceId, {
      where: { workspaceId: input.workspaceId },
      data: { status: "EXPIRED", lastErrorCode: "TOKEN_EXPIRED" }
    });
    return {
      refreshed: false,
      reason: "INSTAGRAM_REAUTHORIZATION_REQUIRED",
      connection: await getSecureInstagramConnection(input.workspaceId)
    };
  }
  if (now.getTime() - credential.tokenIssuedAt.getTime() < 24 * 60 * 60 * 1000)
    return {
      refreshed: false,
      reason: "INSTAGRAM_TOKEN_TOO_NEW",
      connection: await getSecureInstagramConnection(input.workspaceId)
    };
  try {
    const result = await (input.client ?? new InstagramBasicClient()).refresh(credential.accessToken);
    const expiresAt = new Date(now.getTime() + result.expiresIn * 1000);
    await withWorkspaceDbContext(input.workspaceId, async (tx) => {
      await tx.instagramConnectionCredential.update({
        where: { workspaceId: input.workspaceId },
        data: {
          encryptedAccessToken: encryptCredential(result.accessToken, requiredKey()),
          tokenIssuedAt: now,
          tokenExpiresAt: expiresAt,
          status: "CONNECTED",
          lastErrorCode: null
        }
      });
      await tx.auditLog.create({
        data: {
          action: "INSTAGRAM_TOKEN_REFRESHED",
          ...(input.actorId ? { actorId: input.actorId } : {}),
          workspaceId: input.workspaceId,
          targetId: credential.providerAccountId,
          targetType: "InstagramConnection",
          metadata: {
            accountId: credential.providerAccountId,
            tokenExpiresAt: expiresAt.toISOString()
          }
        }
      });
    });
    return {
      refreshed: true,
      connection: await getSecureInstagramConnection(input.workspaceId)
    };
  } catch (error) {
    if (error instanceof InstagramProviderError && error.authorizationInvalid)
      await updateConnection(input.workspaceId, {
        where: { workspaceId: input.workspaceId },
        data: { status: "EXPIRED", lastErrorCode: "AUTHORIZATION_INVALID" }
      });
    return {
      refreshed: false,
      reason: error instanceof InstagramProviderError && error.authorizationInvalid ? "INSTAGRAM_REAUTHORIZATION_REQUIRED" : "INSTAGRAM_REFRESH_FAILED",
      connection: await getSecureInstagramConnection(input.workspaceId)
    };
  }
}

async function updateConnection(workspaceId: string, args: Parameters<typeof prisma.instagramConnectionCredential.update>[0]) {
  return withWorkspaceDbContext(workspaceId, (tx) => tx.instagramConnectionCredential.update(args));
}

function requiredKey(): string {
  if (!env.INSTAGRAM_TOKEN_ENCRYPTION_KEY) throw new Error("Instagram credential storage is not configured");
  return env.INSTAGRAM_TOKEN_ENCRYPTION_KEY;
}
function requiredKeyForOAuth(override?: string | null): string {
  const key = override === undefined ? env.INSTAGRAM_TOKEN_ENCRYPTION_KEY : override;
  if (!key)
    throw new InstagramOAuthDiagnosticError({
      stage: "credential_configuration",
      category: "encryption_key_missing",
      retryable: false
    });
  return key;
}
function diagnostic(stage: InstagramOAuthFailureStage, category: string, retryable: boolean, cause?: unknown) {
  return new InstagramOAuthDiagnosticError({ stage, category, retryable }, cause);
}
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
