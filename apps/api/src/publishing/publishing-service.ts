import type { ContentItem, MediaAsset, Workspace } from "@prisma/client";
import { prisma } from "../db/prisma";
import { refundWorkspaceUsage, reserveWorkspaceUsage, UsageQuotaExceededError } from "../usage/usage-service";
import {
  createInstagramPublisher,
  DryRunInstagramPublisher,
  type InstagramPublishResult,
  type InstagramPublisher,
  type InstagramPublishingLimit,
  MetaGraphPublishError
} from "./instagram-publisher";

export interface PublishAttemptRecord {
  contentItemId: string;
  dryRun: boolean;
  reasons: string[];
  result?: InstagramPublishResult;
  publishingLimit?: InstagramPublishingLimit;
  status: "BLOCKED" | "DRY_RUN" | "FAILED" | "PUBLISHED";
}

export interface PublishDueContentResult {
  attempted: number;
  attempts: PublishAttemptRecord[];
}

export interface PublishDueContentForAllWorkspacesResult {
  attempted: number;
  workspaces: Array<{
    result: PublishDueContentResult;
    workspaceId: string;
  }>;
}

export class PublishContentItemNotFoundError extends Error {
  constructor() {
    super("Content item was not found");
  }
}

const publishableTypes = new Set(["CAROUSEL", "POST", "REEL"]);

export async function publishDueContent(
  workspaceId: string,
  options: { now?: Date; publisher?: InstagramPublisher } = {}
): Promise<PublishDueContentResult> {
  const now = options.now ?? new Date();
  const rows = await prisma.contentItem.findMany({
    where: {
      workspaceId,
      status: "SCHEDULED",
      scheduledAt: {
        lte: now
      },
      deletedAt: null
    },
    orderBy: {
      scheduledAt: "asc"
    },
    take: 10
  });
  const attempts = [];

  for (const row of rows) {
    attempts.push(
      await publishContentItem(workspaceId, row.id, {
        now,
        ...(options.publisher === undefined ? {} : { publisher: options.publisher })
      })
    );
  }

  return {
    attempted: attempts.length,
    attempts
  };
}

export async function publishDueContentForAllWorkspaces(
  options: { now?: Date; publisher?: InstagramPublisher } = {}
): Promise<PublishDueContentForAllWorkspacesResult> {
  const now = options.now ?? new Date();
  const dueWorkspaces = await prisma.contentItem.findMany({
    distinct: ["workspaceId"],
    select: {
      workspaceId: true
    },
    where: {
      deletedAt: null,
      scheduledAt: {
        lte: now
      },
      status: "SCHEDULED"
    }
  });
  const workspaces: PublishDueContentForAllWorkspacesResult["workspaces"] = [];
  let attempted = 0;

  for (const row of dueWorkspaces) {
    const result = await publishDueContent(row.workspaceId, {
      now,
      ...(options.publisher === undefined ? {} : { publisher: options.publisher })
    });
    attempted += result.attempted;
    workspaces.push({
      result,
      workspaceId: row.workspaceId
    });
  }

  return {
    attempted,
    workspaces
  };
}

export async function publishContentItem(
  workspaceId: string,
  contentItemId: string,
  options: { now?: Date; publisher?: InstagramPublisher } = {}
): Promise<PublishAttemptRecord> {
  const now = options.now ?? new Date();
  const [workspace, contentItem] = await Promise.all([
    prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        deletedAt: null
      }
    }),
    prisma.contentItem.findFirst({
      where: {
        id: contentItemId,
        workspaceId,
        deletedAt: null
      }
    })
  ]);

  if (!workspace || !contentItem) {
    throw new PublishContentItemNotFoundError();
  }

  const mediaAssets = await prisma.mediaAsset.findMany({
    where: {
      id: {
        in: contentItem.mediaIds
      },
      workspaceId,
      deletedAt: null
    },
    orderBy: {
      createdAt: "asc"
    }
  });
  const reasons = validatePublishAttempt({ contentItem, mediaAssets, now, workspace });

  if (reasons.length > 0) {
    return {
      contentItemId,
      dryRun: true,
      reasons,
      status: "BLOCKED"
    };
  }

  const publisher = options.publisher ?? createInstagramPublisher();

  if (publisher.getPublishingLimit) {
    let publishingLimit: InstagramPublishingLimit;

    try {
      publishingLimit = await publisher.getPublishingLimit({ workspace });
    } catch (error) {
      if (error instanceof MetaGraphPublishError) {
        return {
          contentItemId,
          dryRun: false,
          reasons: [error.message],
          status: "BLOCKED"
        };
      }

      throw error;
    }

    if (publishingLimit.quotaUsage >= publishingLimit.quotaTotal) {
      return {
        contentItemId,
        dryRun: false,
        publishingLimit,
        reasons: ["INSTAGRAM_DAILY_PUBLISHING_LIMIT_REACHED"],
        status: "BLOCKED"
      };
    }
  }

  let result: InstagramPublishResult;
  const shouldReservePublishUsage = !(publisher instanceof DryRunInstagramPublisher);
  let publishUsageReserved = false;

  try {
    if (shouldReservePublishUsage) {
      try {
        await reserveWorkspaceUsage({ workspaceId, metric: "POST_PUBLISH", now });
        publishUsageReserved = true;
      } catch (error) {
        if (error instanceof UsageQuotaExceededError) {
          return {
            contentItemId,
            dryRun: false,
            reasons: ["POST_PUBLISH_QUOTA_EXCEEDED"],
            status: "BLOCKED"
          };
        }

        throw error;
      }
    }

    result = await publisher.publish({ contentItem, mediaAssets, workspace });
  } catch (error) {
    if (publishUsageReserved) {
      await refundWorkspaceUsage({ workspaceId, metric: "POST_PUBLISH", now });
    }

    if (error instanceof MetaGraphPublishError) {
      await prisma.contentItem.update({
        where: {
          id: contentItem.id
        },
        data: {
          failureReason: error.message,
          status: "FAILED"
        }
      });

      return {
        contentItemId,
        dryRun: false,
        reasons: [error.message],
        status: "FAILED"
      };
    }

    throw error;
  }

  if (publishUsageReserved && result.dryRun) {
    await refundWorkspaceUsage({ workspaceId, metric: "POST_PUBLISH", now });
    publishUsageReserved = false;
  }

  if (!result.dryRun && result.instagramPostId) {
    await prisma.contentItem.update({
      where: {
        id: contentItem.id
      },
      data: {
        instagramPostId: result.instagramPostId,
        publishedAt: now,
        status: "PUBLISHED"
      }
    });
  }

  return {
    contentItemId,
    dryRun: result.dryRun,
    reasons: [],
    result,
    status: result.status
  };
}

function validatePublishAttempt(input: {
  contentItem: ContentItem;
  mediaAssets: MediaAsset[];
  now: Date;
  workspace: Workspace;
}): string[] {
  const reasons: string[] = [];

  if (!input.workspace.instagramAccountId || !input.workspace.instagramAccessToken || !input.workspace.instagramTokenExpiresAt) {
    reasons.push("INSTAGRAM_NOT_CONNECTED");
  } else if (input.workspace.instagramTokenExpiresAt <= input.now) {
    reasons.push("INSTAGRAM_TOKEN_EXPIRED");
  }

  if (input.contentItem.status !== "SCHEDULED") {
    reasons.push("CONTENT_NOT_SCHEDULED");
  }

  if (!input.contentItem.scheduledAt || input.contentItem.scheduledAt > input.now) {
    reasons.push("CONTENT_NOT_DUE");
  }

  if (!publishableTypes.has(input.contentItem.contentType)) {
    reasons.push("CONTENT_TYPE_NOT_PUBLISHABLE");
  }

  const validPublicMediaIds = new Set(
    input.mediaAssets.filter((asset) => asset.cdnUrl.startsWith("https://")).map((asset) => asset.id)
  );

  if (input.contentItem.mediaIds.length === 0 || input.contentItem.mediaIds.some((id) => !validPublicMediaIds.has(id))) {
    reasons.push("PUBLIC_MEDIA_REQUIRED");
  }

  return reasons;
}
