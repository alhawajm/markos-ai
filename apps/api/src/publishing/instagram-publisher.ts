import type { ContentItem, MediaAsset, Workspace } from "@prisma/client";
import { env } from "../config/env";
import { createProviderFetchUrl, MediaStorageError } from "../media/storage-service";
import { InstagramGraphClient, InstagramGraphRequestError } from "../workspace/instagram-graph-client";

export interface InstagramPublishPayload {
  accountId: string;
  contentItemId: string;
  caption: string;
  contentType: "CAROUSEL" | "POST" | "REEL" | "STORY";
  mediaCount: number;
}

export interface InstagramPublishResult {
  dryRun: boolean;
  instagramPostId?: string;
  payload: InstagramPublishPayload;
  status: "DRY_RUN" | "PUBLISHED";
}

export interface InstagramPublishingLimit {
  quotaDurationSeconds: number;
  quotaTotal: number;
  quotaUsage: number;
}

export interface InstagramPublisher {
  getPublishingLimit?(input: { workspace: Workspace }): Promise<InstagramPublishingLimit>;
  publish(input: { contentItem: ContentItem; mediaAssets: MediaAsset[]; workspace: Workspace }): Promise<InstagramPublishResult>;
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type ProviderUrlResolver = (input: { workspaceId: string; storageKey: string; publicUrl: string }) => Promise<string>;

export class DryRunInstagramPublisher implements InstagramPublisher {
  async publish(input: { contentItem: ContentItem; mediaAssets: MediaAsset[]; workspace: Workspace }): Promise<InstagramPublishResult> {
    return {
      dryRun: true,
      payload: buildPayload(input),
      status: "DRY_RUN"
    };
  }
}

export class InstagramPublishError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false
  ) {
    super(code);
  }
}

export class InstagramGraphPublisher implements InstagramPublisher {
  private readonly client: InstagramGraphClient;
  private readonly pollAttempts: number;
  private readonly pollDelayMs: number;
  private readonly providerUrlResolver: ProviderUrlResolver;

  constructor(
    options: {
      /** Test-only transport boundary. Production callers must omit it. */
      fetchImpl?: FetchLike;
      /** Test-only timeout boundary. Production callers must omit it. */
      requestTimeoutMs?: number;
      pollAttempts?: number;
      pollDelayMs?: number;
      /** Test-only provider-fetch URL boundary. Production callers must omit it. */
      providerUrlResolver?: ProviderUrlResolver;
    } = {}
  ) {
    this.client = new InstagramGraphClient({
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      ...(options.requestTimeoutMs === undefined ? {} : { timeoutMs: options.requestTimeoutMs })
    });
    this.pollAttempts = options.pollAttempts ?? env.INSTAGRAM_CONTAINER_POLL_ATTEMPTS;
    this.pollDelayMs = options.pollDelayMs ?? env.INSTAGRAM_CONTAINER_POLL_DELAY_MS;
    this.providerUrlResolver = options.providerUrlResolver ?? createProviderFetchUrl;
  }

  async getPublishingLimit(input: { workspace: Workspace }): Promise<InstagramPublishingLimit> {
    const { accountId, accessToken } = requiredConnection(input.workspace);
    const response = await this.get(accountId, "content_publishing_limit", accessToken, {
      fields: "quota_usage,config"
    });
    const first = Array.isArray(response.data) ? response.data[0] : undefined;
    const limit = isRecord(first) ? first : undefined;
    const config = isRecord(limit?.config) ? limit.config : undefined;
    const quotaDurationSeconds = finiteNonnegative(config?.quota_duration);
    const quotaTotal = finiteNonnegative(config?.quota_total);
    const quotaUsage = finiteNonnegative(limit?.quota_usage);

    if (quotaDurationSeconds === undefined || quotaTotal === undefined || quotaUsage === undefined) {
      throw new InstagramPublishError("INSTAGRAM_PUBLISHING_LIMIT_RESPONSE_INVALID");
    }

    return {
      quotaDurationSeconds,
      quotaTotal,
      quotaUsage
    };
  }

  async publish(input: { contentItem: ContentItem; mediaAssets: MediaAsset[]; workspace: Workspace }): Promise<InstagramPublishResult> {
    if (input.contentItem.contentType !== "POST") {
      throw new InstagramPublishError("INSTAGRAM_MILESTONE_A_IMAGE_POST_ONLY");
    }

    if (input.mediaAssets.length !== 1 || input.mediaAssets[0] === undefined) {
      throw new InstagramPublishError("INSTAGRAM_PUBLISH_REQUIRES_ONE_IMAGE");
    }

    const mediaAsset = input.mediaAssets[0];
    const mediaReasons = validateInstagramImageForPublishing(mediaAsset);

    if (mediaReasons[0] !== undefined) {
      throw new InstagramPublishError(mediaReasons[0]);
    }

    const { accountId, accessToken } = requiredConnection(input.workspace);
    const payload = buildPayload(input);
    let providerImageUrl: string;

    try {
      providerImageUrl = await this.providerUrlResolver({
        workspaceId: mediaAsset.workspaceId,
        storageKey: mediaAsset.s3Key,
        publicUrl: mediaAsset.cdnUrl
      });
    } catch (error) {
      if (error instanceof MediaStorageError) throw new InstagramPublishError(error.code);
      throw new InstagramPublishError("MEDIA_PROVIDER_URL_SIGNING_FAILED");
    }

    if (!isPublicHttpsUrl(providerImageUrl)) {
      throw new InstagramPublishError("MEDIA_PROVIDER_URL_INVALID");
    }

    const container = await this.post(accountId, "media", accessToken, {
      caption: payload.caption,
      image_url: providerImageUrl
    });
    const creationId = requiredIdentifier(container.id, "INSTAGRAM_CONTAINER_RESPONSE_INVALID");

    await this.waitForContainer(creationId, accessToken);

    const published = await this.post(accountId, "media_publish", accessToken, {
      creation_id: creationId
    });
    const instagramPostId = requiredIdentifier(published.id, "INSTAGRAM_PUBLISH_RESPONSE_INVALID");

    return {
      dryRun: false,
      instagramPostId,
      payload,
      status: "PUBLISHED"
    };
  }

  private async waitForContainer(creationId: string, accessToken: string): Promise<void> {
    for (let attempt = 0; attempt < this.pollAttempts; attempt += 1) {
      const response = await this.get(creationId, undefined, accessToken, {
        fields: "status_code"
      });
      const status = response.status_code;

      if (status === "FINISHED") return;
      if (status === "ERROR") throw new InstagramPublishError("INSTAGRAM_CONTAINER_PROCESSING_FAILED");
      if (status === "EXPIRED") throw new InstagramPublishError("INSTAGRAM_CONTAINER_EXPIRED");
      if (status === "PUBLISHED") throw new InstagramPublishError("INSTAGRAM_CONTAINER_ALREADY_PUBLISHED");
      if (status !== "IN_PROGRESS") throw new InstagramPublishError("INSTAGRAM_CONTAINER_STATUS_INVALID");

      if (attempt < this.pollAttempts - 1 && this.pollDelayMs > 0) {
        await delay(this.pollDelayMs);
      }
    }

    throw new InstagramPublishError("INSTAGRAM_CONTAINER_PROCESSING_TIMEOUT", true);
  }

  private async get(
    objectId: string,
    edge: "content_publishing_limit" | undefined,
    accessToken: string,
    query: Record<string, string>
  ): Promise<Record<string, unknown>> {
    try {
      return await this.client.get(objectId, edge, accessToken, query);
    } catch (error) {
      throw mapGraphError(error);
    }
  }

  private async post(objectId: string, edge: "media" | "media_publish", accessToken: string, body: Record<string, string>): Promise<Record<string, unknown>> {
    try {
      return await this.client.post(objectId, edge, accessToken, body);
    } catch (error) {
      throw mapGraphError(error);
    }
  }
}

export function createInstagramPublisher(): InstagramPublisher {
  return env.INSTAGRAM_PUBLISH_MODE === "live" ? new InstagramGraphPublisher() : new DryRunInstagramPublisher();
}

export function validateInstagramImageForPublishing(mediaAsset: MediaAsset): string[] {
  const reasons: string[] = [];
  const extension = mediaAsset.filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];

  if (mediaAsset.mimeType.toLowerCase() !== "image/jpeg" || (extension !== ".jpg" && extension !== ".jpeg")) {
    reasons.push("INSTAGRAM_PUBLISH_JPEG_REQUIRED");
  }

  if (!Number.isInteger(mediaAsset.width) || (mediaAsset.width ?? 0) <= 0 || !Number.isInteger(mediaAsset.height) || (mediaAsset.height ?? 0) <= 0) {
    reasons.push("INSTAGRAM_PUBLISH_IMAGE_DIMENSIONS_REQUIRED");
  }

  if (!Number.isInteger(mediaAsset.sizeBytes) || mediaAsset.sizeBytes <= 0) {
    reasons.push("INSTAGRAM_PUBLISH_IMAGE_SIZE_REQUIRED");
  }

  if (!isPublicHttpsUrl(mediaAsset.cdnUrl)) {
    reasons.push("INSTAGRAM_PUBLISH_PUBLIC_HTTPS_URL_REQUIRED");
  }

  return reasons;
}

export function buildCaption(contentItem: ContentItem): string {
  const caption = contentItem.captionEn ?? contentItem.captionAr ?? "";
  const hashtags = contentItem.hashtags.join(" ");
  return [caption, hashtags].filter(Boolean).join("\n\n");
}

function buildPayload(input: { contentItem: ContentItem; mediaAssets: MediaAsset[]; workspace: Workspace }): InstagramPublishPayload {
  return {
    accountId: input.workspace.instagramAccountId ?? "",
    contentItemId: input.contentItem.id,
    caption: buildCaption(input.contentItem),
    contentType: input.contentItem.contentType,
    mediaCount: input.mediaAssets.length
  };
}

function requiredConnection(workspace: Workspace): { accountId: string; accessToken: string } {
  if (!workspace.instagramAccountId || !workspace.instagramAccessToken) {
    throw new InstagramPublishError("INSTAGRAM_NOT_CONNECTED");
  }

  return {
    accountId: workspace.instagramAccountId,
    accessToken: workspace.instagramAccessToken
  };
}

function requiredIdentifier(value: unknown, code: string): string {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).length === 0) {
    throw new InstagramPublishError(code);
  }

  return String(value);
}

function finiteNonnegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username.length === 0 && url.password.length === 0;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapGraphError(error: unknown): InstagramPublishError {
  if (error instanceof InstagramGraphRequestError) {
    return new InstagramPublishError(error.code, error.diagnostic.retryable);
  }

  return new InstagramPublishError("INSTAGRAM_PROVIDER_CLIENT_ERROR");
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
