import type { InstagramConnection, PublishReadiness } from "@markos/shared-types";
import type { ConnectInstagramInput } from "@markos/validation";
import { prisma } from "../db/prisma";
import { toContentRecord } from "../content/content-service";

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

  return toInstagramConnection(workspace);
}

export async function connectInstagram(workspaceId: string, input: ConnectInstagramInput): Promise<InstagramConnection> {
  const workspace = await prisma.workspace.update({
    where: {
      id: workspaceId
    },
    data: {
      instagramAccountId: input.accountId,
      instagramAccessToken: input.accessToken,
      instagramTokenExpiresAt: new Date(input.tokenExpiresAt)
    }
  });

  return toInstagramConnection(workspace);
}

export async function disconnectInstagram(workspaceId: string): Promise<InstagramConnection> {
  const workspace = await prisma.workspace.update({
    where: {
      id: workspaceId
    },
    data: {
      instagramAccountId: null,
      instagramAccessToken: null,
      instagramTokenExpiresAt: null
    }
  });

  return toInstagramConnection(workspace);
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
      const validPublicMediaIds = new Set(
        mediaAssets.filter((asset) => asset.cdnUrl.startsWith("https://")).map((asset) => asset.id)
      );

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

function toInstagramConnection(workspace: {
  instagramAccountId: string | null;
  instagramAccessToken: string | null;
  instagramTokenExpiresAt: Date | null;
}): InstagramConnection {
  const connected =
    workspace.instagramAccountId !== null &&
    workspace.instagramAccessToken !== null &&
    workspace.instagramTokenExpiresAt !== null &&
    workspace.instagramTokenExpiresAt > new Date();

  return {
    connected,
    ...(workspace.instagramAccountId === null ? {} : { accountId: workspace.instagramAccountId }),
    ...(workspace.instagramTokenExpiresAt === null ? {} : { tokenExpiresAt: workspace.instagramTokenExpiresAt.toISOString() })
  };
}
