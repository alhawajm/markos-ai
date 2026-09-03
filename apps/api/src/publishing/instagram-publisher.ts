import type { ContentItem, MediaAsset, Workspace } from "@prisma/client";
import { validateInstagramImageMetadata } from "@markos/validation";
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
    const { accountId, accessToken } = requiredConnection(input.workspace);
    const payload = buildPayload(input);
    const creationId = await this.createPublishContainer(input, accountId, accessToken, payload.caption);

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

  private async createPublishContainer(
    input: { contentItem: ContentItem; mediaAssets: MediaAsset[]; workspace: Workspace },
    accountId: string,
    accessToken: string,
    caption: string
  ): Promise<string> {
    const { contentType } = input.contentItem;

    if (contentType === "CAROUSEL") {
      if (input.mediaAssets.length < 2 || input.mediaAssets.length > 10) {
        throw new InstagramPublishError("INSTAGRAM_CAROUSEL_REQUIRES_TWO_TO_TEN_ITEMS");
      }
      const children: string[] = [];
      for (const asset of input.mediaAssets) {
        const reason = validateInstagramImageForPublishing(asset)[0];
        if (reason) throw new InstagramPublishError(reason);
        const url = await this.resolveMediaUrl(asset);
        const child = await this.post(accountId, "media", accessToken, {
          image_url: url,
          is_carousel_item: "true"
        });
        children.push(requiredIdentifier(child.id, "INSTAGRAM_CONTAINER_RESPONSE_INVALID"));
      }
      const parent = await this.post(accountId, "media", accessToken, {
        caption,
        children: children.join(","),
        media_type: "CAROUSEL"
      });
      return requiredIdentifier(parent.id, "INSTAGRAM_CONTAINER_RESPONSE_INVALID");
    }

    if (input.mediaAssets.length !== 1 || input.mediaAssets[0] === undefined) {
      throw new InstagramPublishError("INSTAGRAM_PUBLISH_REQUIRES_ONE_MEDIA_ITEM");
    }
    const asset = input.mediaAssets[0];

    if (contentType === "REEL") {
      const reason = validateInstagramVideoForPublishing(asset)[0];
      if (reason) throw new InstagramPublishError(reason);
      const providerUrl = await this.resolveMediaUrl(asset);
      const container = await this.post(accountId, "media", accessToken, {
        caption,
        media_type: "REELS",
        share_to_feed: "true",
        video_url: providerUrl
      });
      return requiredIdentifier(container.id, "INSTAGRAM_CONTAINER_RESPONSE_INVALID");
    }

    if (contentType === "STORY") {
      const reason = asset.mimeType.startsWith("video/") ? validateInstagramVideoForPublishing(asset)[0] : validateInstagramStoryImageForPublishing(asset)[0];
      if (reason) throw new InstagramPublishError(reason);
      const providerUrl = await this.resolveMediaUrl(asset);
      const container = await this.post(accountId, "media", accessToken, {
        media_type: "STORIES",
        ...(asset.mimeType.startsWith("video/") ? { video_url: providerUrl } : { image_url: providerUrl })
      });
      return requiredIdentifier(container.id, "INSTAGRAM_CONTAINER_RESPONSE_INVALID");
    }

    const reason = validateInstagramImageForPublishing(asset)[0];
    if (reason) throw new InstagramPublishError(reason);
    const providerUrl = await this.resolveMediaUrl(asset);
    const container = await this.post(accountId, "media", accessToken, {
      caption,
      image_url: providerUrl
    });
    return requiredIdentifier(container.id, "INSTAGRAM_CONTAINER_RESPONSE_INVALID");
  }

  private async resolveMediaUrl(mediaAsset: MediaAsset): Promise<string> {
    let providerUrl: string;
    try {
      providerUrl = await this.providerUrlResolver({
        workspaceId: mediaAsset.workspaceId,
        storageKey: mediaAsset.s3Key,
        publicUrl: mediaAsset.cdnUrl
      });
    } catch (error) {
      if (error instanceof MediaStorageError) throw new InstagramPublishError(error.code);
      throw new InstagramPublishError("MEDIA_PROVIDER_URL_SIGNING_FAILED");
    }
    if (!isPublicHttpsUrl(providerUrl)) throw new InstagramPublishError("MEDIA_PROVIDER_URL_INVALID");
    return providerUrl;
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

    throw new InstagramPublishError("INSTAGRAM_CONTAINER_PROCESSING_TIMEOUT");
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
  const reasons: string[] = validateInstagramImageMetadata(mediaAsset);

  if (!isPublicHttpsUrl(mediaAsset.cdnUrl)) {
    reasons.push("INSTAGRAM_PUBLISH_PUBLIC_HTTPS_URL_REQUIRED");
  }

  return reasons;
}

export function validateInstagramStoryImageForPublishing(mediaAsset: MediaAsset): string[] {
  const reasons: string[] = [];
  const extension = mediaAsset.filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if (mediaAsset.mimeType.toLowerCase() !== "image/jpeg" || (extension !== ".jpg" && extension !== ".jpeg")) {
    reasons.push("INSTAGRAM_PUBLISH_JPEG_REQUIRED");
  }
  if (!mediaAsset.width || !mediaAsset.height || Math.abs(mediaAsset.width / mediaAsset.height - 9 / 16) > 0.03) {
    reasons.push("INSTAGRAM_STORY_9_16_MEDIA_REQUIRED");
  }
  if (mediaAsset.sizeBytes <= 0 || mediaAsset.sizeBytes > 8_000_000) reasons.push("INSTAGRAM_PUBLISH_IMAGE_TOO_LARGE");
  if (!isPublicHttpsUrl(mediaAsset.cdnUrl)) reasons.push("INSTAGRAM_PUBLISH_PUBLIC_HTTPS_URL_REQUIRED");
  return reasons;
}

export function validateInstagramVideoForPublishing(mediaAsset: MediaAsset): string[] {
  const reasons: string[] = [];
  if (mediaAsset.mimeType.toLowerCase() !== "video/mp4" || !mediaAsset.filename.toLowerCase().endsWith(".mp4")) {
    reasons.push("INSTAGRAM_PUBLISH_MP4_REQUIRED");
  }
  if (!mediaAsset.width || !mediaAsset.height || Math.abs(mediaAsset.width / mediaAsset.height - 9 / 16) > 0.03) {
    reasons.push("INSTAGRAM_VIDEO_9_16_REQUIRED");
  }
  if (!mediaAsset.durationSeconds || mediaAsset.durationSeconds < 3 || mediaAsset.durationSeconds > 900) {
    reasons.push("INSTAGRAM_VIDEO_DURATION_UNSUPPORTED");
  }
  if (mediaAsset.sizeBytes <= 0 || mediaAsset.sizeBytes > 1_000_000_000) reasons.push("INSTAGRAM_VIDEO_TOO_LARGE");
  if (!isPublicHttpsUrl(mediaAsset.cdnUrl)) reasons.push("INSTAGRAM_PUBLISH_PUBLIC_HTTPS_URL_REQUIRED");
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
