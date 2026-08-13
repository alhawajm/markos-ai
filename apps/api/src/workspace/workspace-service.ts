import type { AuditLogRecord, InstagramConnection, PublishReadiness } from "@markos/shared-types";
import { prisma } from "../db/prisma";
import { toContentRecord } from "../content/content-service";
import { getSecureInstagramConnection } from "./instagram-connection-service";

export class WorkspaceNotFoundError extends Error {
  constructor() {
    super("Workspace was not found");
  }
}

export class ContentItemNotFoundForReadinessError extends Error {
  constructor() {
    super("Content item was not found");
  }
}

export async function getInstagramConnection(workspaceId: string): Promise<InstagramConnection> {
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      deletedAt: null
    }
  });

  if (!workspace) {
    throw new WorkspaceNotFoundError();
  }

  return getSecureInstagramConnection(workspaceId);
}

export async function listWorkspaceAuditLogs(workspaceId: string, input: { limit?: number } = {}): Promise<AuditLogRecord[]> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const rows = await prisma.auditLog.findMany({
    orderBy: {
      createdAt: "desc"
    },
    take: limit,
    where: {
      workspaceId
    }
  });

  return rows.map(toAuditLogRecord);
}

export async function getPublishReadiness(workspaceId: string, contentItemId: string): Promise<PublishReadiness> {
  const [connection, contentItem] = await Promise.all([
    getInstagramConnection(workspaceId),
    prisma.contentItem.findFirst({
      where: {
        id: contentItemId,
        workspaceId,
        deletedAt: null
      }
    })
  ]);

  if (!contentItem) {
    throw new ContentItemNotFoundForReadinessError();
  }

  const reasons: string[] = [];

  if (!connection.connected) {
    reasons.push("INSTAGRAM_NOT_CONNECTED");
  }

  if (contentItem.status !== "SCHEDULED") {
    reasons.push("CONTENT_NOT_SCHEDULED");
  }

  if (!contentItem.scheduledAt || contentItem.scheduledAt <= new Date()) {
    reasons.push("SCHEDULE_TIME_NOT_IN_FUTURE");
  }

  if (contentItem.contentType === "POST" || contentItem.contentType === "CAROUSEL" || contentItem.contentType === "REEL") {
    if (contentItem.mediaIds.length === 0) {
      reasons.push("PUBLIC_MEDIA_REQUIRED");
    } else {
      const mediaAssets = await prisma.mediaAsset.findMany({
        where: {
          id: {
            in: contentItem.mediaIds
          },
          workspaceId,
          deletedAt: null
        },
        select: {
          id: true,
          cdnUrl: true
        }
      });
      const validPublicMediaIds = new Set(mediaAssets.filter((asset) => asset.cdnUrl.startsWith("https://")).map((asset) => asset.id));

      if (contentItem.mediaIds.some((id) => !validPublicMediaIds.has(id))) {
        reasons.push("PUBLIC_MEDIA_REQUIRED");
      }
    }
  }

  if (connection.tokenExpiresAt && new Date(connection.tokenExpiresAt) <= new Date()) {
    reasons.push("INSTAGRAM_TOKEN_EXPIRED");
  }

  return {
    connection,
    contentItem: toContentRecord(contentItem),
    ready: reasons.length === 0,
    reasons
  };
}

function toAuditLogRecord(row: {
  action: string;
  actorId: string | null;
  createdAt: Date;
  id: string;
  metadata: unknown;
  targetId: string | null;
  targetType: string;
  workspaceId: string | null;
}): AuditLogRecord {
  const metadata = isRecord(row.metadata) ? row.metadata : undefined;

  return {
    action: row.action,
    ...(row.actorId === null ? {} : { actorId: row.actorId }),
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    ...(metadata === undefined ? {} : { metadata }),
    ...(row.targetId === null ? {} : { targetId: row.targetId }),
    targetType: row.targetType,
    workspaceId: row.workspaceId ?? ""
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
