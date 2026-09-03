import type { ContentItem, MediaAsset, Workspace } from "@prisma/client";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { hasCanonicalReleaseScopeSet, INSTAGRAM_RELEASE_SCOPES } from "../config/instagram-contract";
import { refundWorkspaceUsage, reserveWorkspaceUsage, UsagePlanInactiveError, UsageQuotaExceededError } from "../usage/usage-service";
import {
  createInstagramPublisher,
  DryRunInstagramPublisher,
  InstagramGraphPublisher,
  InstagramPublishError,
  type InstagramPublishResult,
  type InstagramPublisher,
  type InstagramPublishingLimit,
  validateInstagramImageForPublishing,
  validateInstagramStoryImageForPublishing,
  validateInstagramVideoForPublishing
} from "./instagram-publisher";
import { getSecureInstagramConnection, withSecureInstagramCredential } from "../workspace/instagram-connection-service";

export interface PublishAttemptRecord {
  contentItemId: string;
  dryRun: boolean;
  reasons: string[];
  result?: InstagramPublishResult;
  publishingLimit?: InstagramPublishingLimit;
  status: "BLOCKED" | "DRY_RUN" | "FAILED" | "PUBLISHED";
  retryable?: boolean;
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

export interface PublishingLiveReadiness {
  mode: "dry_run" | "live";
  ready: boolean;
  reasons: string[];
  connection: {
    connected: boolean;
    accountId?: string;
    tokenExpiresAt?: string;
  };
  requiredEnv: string[];
  requiredScopes: string[];
  graphVersion: string;
}

export class PublishContentItemNotFoundError extends Error {
  constructor() {
    super("Content item was not found");
  }
}

export class PublishRescheduleInvalidError extends Error {
  constructor() {
    super("Only failed publishing items can be rescheduled from the publishing queue");
  }
}

const publishableTypes = new Set(["CAROUSEL", "POST", "REEL", "STORY"]);
const publishingRequiredEnv = [
  "INSTAGRAM_PUBLISH_MODE",
  "INSTAGRAM_APP_ID",
  "INSTAGRAM_APP_SECRET",
  "INSTAGRAM_OAUTH_REDIRECT_URI",
  "INSTAGRAM_OAUTH_STATE_SECRET",
  "INSTAGRAM_TOKEN_ENCRYPTION_KEY",
  "INSTAGRAM_GRAPH_VERSION",
  "INSTAGRAM_OAUTH_SCOPES",
  "MEDIA_STORAGE_DRIVER",
  "AWS_ENDPOINT_URL",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_S3_BUCKET_NAME",
  "AWS_DEFAULT_REGION",
  "AWS_S3_URL_STYLE",
  "SIGNED_URL_TTL"
];
const activePublishAttempts = new Map<string, Promise<PublishAttemptRecord>>();

export async function listPublishingQueue(workspaceId: string): Promise<ContentItem[]> {
  return prisma.contentItem.findMany({
    where: {
      workspaceId,
      status: {
        in: ["FAILED", "SCHEDULED"]
      },
      deletedAt: null
    },
    orderBy: [
      {
        status: "desc"
      },
      {
        scheduledAt: "asc"
      },
      {
        updatedAt: "desc"
      }
    ],
    take: 100
  });
}

export async function getPublishingLiveReadiness(workspaceId: string): Promise<PublishingLiveReadiness> {
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      deletedAt: null
    }
  });

  if (!workspace) {
    throw new PublishContentItemNotFoundError();
  }

  const reasons: string[] = [];

  if (env.INSTAGRAM_PUBLISH_MODE !== "live") {
    reasons.push("INSTAGRAM_PUBLISH_MODE_NOT_LIVE");
  }

  for (const key of publishingRequiredEnv) {
    if (!hasConfiguredEnv(key)) {
      reasons.push(`MISSING_${key}`);
    }
  }

  const connection = await getSecureInstagramConnection(workspaceId);

  if (!connection.connected) {
    reasons.push("INSTAGRAM_NOT_CONNECTED");
  }

  if (connection.status === "REAUTHORIZE_REQUIRED") {
    reasons.push("INSTAGRAM_TOKEN_EXPIRED");
  }

  if (!hasCanonicalReleaseScopeSet(env.INSTAGRAM_OAUTH_SCOPES)) {
    reasons.push("INSTAGRAM_RELEASE_SCOPE_SET_INVALID");
  }

  if (env.MEDIA_STORAGE_DRIVER !== "s3") {
    reasons.push("MEDIA_STORAGE_DRIVER_NOT_S3");
  }

  if (connection.connected && !hasCanonicalReleaseScopeSet(connection.requestedScopes ?? [])) {
    reasons.push("INSTAGRAM_RECONNECT_REQUIRED_FOR_RELEASE_SCOPES");
  }

  return {
    connection,
    mode: env.INSTAGRAM_PUBLISH_MODE,
    ready: reasons.length === 0,
    reasons,
    requiredEnv: publishingRequiredEnv,
    requiredScopes: [...INSTAGRAM_RELEASE_SCOPES],
    graphVersion: env.INSTAGRAM_GRAPH_VERSION
  };
}

export async function rescheduleFailedPublish(workspaceId: string, contentItemId: string, input: { scheduledAt: string }): Promise<ContentItem> {
  const contentItem = await prisma.contentItem.findFirst({
    where: {
      id: contentItemId,
      workspaceId,
      deletedAt: null
    }
  });

  if (!contentItem) {
    throw new PublishContentItemNotFoundError();
  }

  if (contentItem.status !== "FAILED") {
    throw new PublishRescheduleInvalidError();
  }

  const scheduledAt = parseFutureScheduleTime(input.scheduledAt);

  return prisma.contentItem.update({
    where: {
      id: contentItem.id
    },
    data: {
      failureReason: null,
      scheduledAt,
      status: "SCHEDULED"
    }
  });
}

export async function publishDueContent(workspaceId: string, options: { now?: Date; publisher?: InstagramPublisher } = {}): Promise<PublishDueContentResult> {
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
  const guardKey = `${workspaceId}:${contentItemId}`;

  if (activePublishAttempts.has(guardKey)) {
    return {
      contentItemId,
      dryRun: env.INSTAGRAM_PUBLISH_MODE !== "live",
      reasons: ["INSTAGRAM_PUBLISH_ALREADY_IN_PROGRESS"],
      status: "BLOCKED"
    };
  }

  const attempt = executePublishContentItem(workspaceId, contentItemId, options);
  activePublishAttempts.set(guardKey, attempt);

  try {
    return await attempt;
  } finally {
    if (activePublishAttempts.get(guardKey) === attempt) activePublishAttempts.delete(guardKey);
  }
}

async function executePublishContentItem(
  workspaceId: string,
  contentItemId: string,
  options: { now?: Date; publisher?: InstagramPublisher } = {}
): Promise<PublishAttemptRecord> {
  const now = options.now ?? new Date();
  const publisher = options.publisher ?? createInstagramPublisher();
  const liveConnection = publisher instanceof InstagramGraphPublisher ? await getSecureInstagramConnection(workspaceId) : undefined;
  const [storedWorkspace, contentItem] = await Promise.all([
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

  if (!storedWorkspace || !contentItem) {
    throw new PublishContentItemNotFoundError();
  }
  const workspace = await withSecureInstagramCredential(storedWorkspace);

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
  const reasons = validatePublishAttempt({
    contentItem,
    mediaAssets,
    now,
    workspace,
    ...(liveConnection?.accountType === undefined ? {} : { instagramAccountType: liveConnection.accountType }),
    liveProvider: publisher instanceof InstagramGraphPublisher,
    releaseScopesCurrent: liveConnection === undefined || !liveConnection.connected || hasCanonicalReleaseScopeSet(liveConnection.requestedScopes ?? [])
  });

  if (reasons.length > 0) {
    return {
      contentItemId,
      dryRun: true,
      reasons,
      status: "BLOCKED"
    };
  }

  if (publisher.getPublishingLimit) {
    let publishingLimit: InstagramPublishingLimit;

    try {
      publishingLimit = await publisher.getPublishingLimit({ workspace });
    } catch (error) {
      if (error instanceof InstagramPublishError) {
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

        if (error instanceof UsagePlanInactiveError) {
          return {
            contentItemId,
            dryRun: false,
            reasons: [`BILLING_STATUS_${error.status}`],
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

    if (error instanceof InstagramPublishError) {
      await prisma.contentItem.update({
        where: {
          id: contentItem.id
        },
        data: {
          failureReason: error.message,
          status: error.retryable ? "SCHEDULED" : "FAILED"
        }
      });

      return {
        contentItemId,
        dryRun: false,
        reasons: [error.message],
        status: "FAILED",
        retryable: error.retryable
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
        failureReason: null,
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
  instagramAccountType?: string;
  liveProvider: boolean;
  releaseScopesCurrent: boolean;
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

  if (!input.releaseScopesCurrent) {
    reasons.push("INSTAGRAM_RECONNECT_REQUIRED_FOR_RELEASE_SCOPES");
  }

  if (!input.contentItem.scheduledAt || input.contentItem.scheduledAt > input.now) {
    reasons.push("CONTENT_NOT_DUE");
  }

  if (!publishableTypes.has(input.contentItem.contentType)) {
    reasons.push("CONTENT_TYPE_NOT_PUBLISHABLE");
  }

  reasons.push(...validateContentMedia(input.contentItem, input.mediaAssets, input.instagramAccountType));

  if (input.liveProvider && input.mediaAssets.some((asset) => !asset.s3Key.startsWith("s3:") && !asset.s3Key.startsWith("external:"))) {
    reasons.push("INSTAGRAM_PUBLISH_PROVIDER_FETCHABLE_MEDIA_REQUIRED");
  }

  const validPublicMediaIds = new Set(input.mediaAssets.filter((asset) => asset.cdnUrl.startsWith("https://")).map((asset) => asset.id));

  if (input.contentItem.mediaIds.length === 0 || input.contentItem.mediaIds.some((id) => !validPublicMediaIds.has(id))) {
    reasons.push("PUBLIC_MEDIA_REQUIRED");
  }

  return reasons;
}

function validateContentMedia(contentItem: ContentItem, mediaAssets: MediaAsset[], instagramAccountType?: string): string[] {
  if (contentItem.contentType === "CAROUSEL") {
    if (mediaAssets.length < 2 || mediaAssets.length > 10) return ["INSTAGRAM_CAROUSEL_REQUIRES_TWO_TO_TEN_ITEMS"];
    return mediaAssets.flatMap(validateInstagramImageForPublishing);
  }
  if (mediaAssets.length !== 1 || mediaAssets[0] === undefined) return ["INSTAGRAM_PUBLISH_REQUIRES_ONE_MEDIA_ITEM"];
  const asset = mediaAssets[0];
  if (contentItem.contentType === "REEL") return validateInstagramVideoForPublishing(asset);
  if (contentItem.contentType === "STORY") {
    const reasons =
      instagramAccountType === undefined || instagramAccountType.toUpperCase() === "BUSINESS" ? [] : ["INSTAGRAM_STORY_REQUIRES_BUSINESS_ACCOUNT"];
    return reasons.concat(asset.mimeType.startsWith("video/") ? validateInstagramVideoForPublishing(asset) : validateInstagramStoryImageForPublishing(asset));
  }
  return validateInstagramImageForPublishing(asset);
}

function parseFutureScheduleTime(value: string): Date {
  const scheduledAt = new Date(value);

  if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt <= new Date()) {
    throw new PublishRescheduleInvalidError();
  }

  if (scheduledAt.getUTCMinutes() % 30 !== 0 || scheduledAt.getUTCSeconds() !== 0 || scheduledAt.getUTCMilliseconds() !== 0) {
    throw new PublishRescheduleInvalidError();
  }

  return scheduledAt;
}

function hasConfiguredEnv(key: string): boolean {
  const value = process.env[key];
  return typeof value === "string" && value.trim().length > 0;
}
