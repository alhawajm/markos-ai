import type { ContentItem, MediaAsset, Workspace } from "@prisma/client";
import { env } from "../config/env";

export interface InstagramPublishPayload {
  accountId: string;
  contentItemId: string;
  caption: string;
  contentType: "CAROUSEL" | "POST" | "REEL" | "STORY";
  mediaUrls: string[];
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
  publish(input: {
    contentItem: ContentItem;
    mediaAssets: MediaAsset[];
    workspace: Workspace;
  }): Promise<InstagramPublishResult>;
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class DryRunInstagramPublisher implements InstagramPublisher {
  async publish(input: { contentItem: ContentItem; mediaAssets: MediaAsset[]; workspace: Workspace }): Promise<InstagramPublishResult> {
    const payload: InstagramPublishPayload = {
      accountId: input.workspace.instagramAccountId ?? "",
      contentItemId: input.contentItem.id,
      caption: buildCaption(input.contentItem),
      contentType: input.contentItem.contentType,
      mediaUrls: input.mediaAssets.map((asset) => asset.cdnUrl)
    };

    return {
      dryRun: true,
      payload,
      status: "DRY_RUN"
    };
  }
}

export class MetaGraphPublishError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class MetaGraphInstagramPublisher implements InstagramPublisher {
  private readonly fetchImpl: FetchLike;
  private readonly graphBaseUrl: string;
  private readonly graphVersion: string;
  private readonly pollAttempts: number;
  private readonly pollDelayMs: number;

  constructor(options: {
    fetchImpl?: FetchLike;
    graphBaseUrl?: string;
    graphVersion?: string;
    pollAttempts?: number;
    pollDelayMs?: number;
  } = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.graphBaseUrl = (options.graphBaseUrl ?? env.META_GRAPH_BASE_URL).replace(/\/$/, "");
    this.graphVersion = options.graphVersion ?? env.META_GRAPH_VERSION;
    this.pollAttempts = options.pollAttempts ?? env.INSTAGRAM_CONTAINER_POLL_ATTEMPTS;
    this.pollDelayMs = options.pollDelayMs ?? env.INSTAGRAM_CONTAINER_POLL_DELAY_MS;
  }

  async getPublishingLimit(input: { workspace: Workspace }): Promise<InstagramPublishingLimit> {
    const accessToken = input.workspace.instagramAccessToken;

    if (!input.workspace.instagramAccountId || !accessToken) {
      throw new MetaGraphPublishError("Instagram account connection is missing");
    }

    const response = await this.graphGet<{
      data?: Array<{
        config?: {
          quota_duration?: number;
          quota_total?: number;
        };
        quota_usage?: number;
      }>;
    }>(`/${input.workspace.instagramAccountId}/content_publishing_limit`, accessToken, {
      fields: "quota_usage,config"
    });
    const limit = response.data?.[0];

    if (!limit?.config || typeof limit.quota_usage !== "number") {
      throw new MetaGraphPublishError("Instagram publishing limit response is missing quota data");
    }

    return {
      quotaDurationSeconds: limit.config.quota_duration ?? 86400,
      quotaTotal: limit.config.quota_total ?? 50,
      quotaUsage: limit.quota_usage
    };
  }

  async publish(input: { contentItem: ContentItem; mediaAssets: MediaAsset[]; workspace: Workspace }): Promise<InstagramPublishResult> {
    const payload: InstagramPublishPayload = {
      accountId: input.workspace.instagramAccountId ?? "",
      contentItemId: input.contentItem.id,
      caption: buildCaption(input.contentItem),
      contentType: input.contentItem.contentType,
      mediaUrls: input.mediaAssets.map((asset) => asset.cdnUrl)
    };
    const accessToken = input.workspace.instagramAccessToken;

    if (!input.workspace.instagramAccountId || !accessToken) {
      throw new MetaGraphPublishError("Instagram account connection is missing");
    }

    const creationId =
      input.contentItem.contentType === "CAROUSEL"
        ? await this.createCarouselContainer(payload, input.mediaAssets, accessToken)
        : await this.createSingleMediaContainer(payload, input.mediaAssets[0], accessToken);

    await this.waitForContainer(creationId, accessToken);

    const published = await this.graphPost<{ id: string }>(`/${input.workspace.instagramAccountId}/media_publish`, accessToken, {
      creation_id: creationId
    });

    return {
      dryRun: false,
      instagramPostId: published.id,
      payload,
      status: "PUBLISHED"
    };
  }

  private async createSingleMediaContainer(
    payload: InstagramPublishPayload,
    mediaAsset: MediaAsset | undefined,
    accessToken: string
  ): Promise<string> {
    if (!mediaAsset) {
      throw new MetaGraphPublishError("At least one media asset is required");
    }

    const body: Record<string, string> = {
      caption: payload.caption
    };

    if (payload.contentType === "REEL") {
      body.media_type = "REELS";
      body.video_url = mediaAsset.cdnUrl;
    } else {
      body.image_url = mediaAsset.cdnUrl;
    }

    const response = await this.graphPost<{ id: string }>(`/${payload.accountId}/media`, accessToken, body);
    return response.id;
  }

  private async createCarouselContainer(
    payload: InstagramPublishPayload,
    mediaAssets: MediaAsset[],
    accessToken: string
  ): Promise<string> {
    const childIds = [];

    for (const mediaAsset of mediaAssets) {
      const child = await this.graphPost<{ id: string }>(`/${payload.accountId}/media`, accessToken, {
        image_url: mediaAsset.cdnUrl,
        is_carousel_item: "true"
      });
      childIds.push(child.id);
    }

    const response = await this.graphPost<{ id: string }>(`/${payload.accountId}/media`, accessToken, {
      caption: payload.caption,
      children: childIds.join(","),
      media_type: "CAROUSEL"
    });

    return response.id;
  }

  private async waitForContainer(creationId: string, accessToken: string): Promise<void> {
    for (let attempt = 0; attempt < this.pollAttempts; attempt += 1) {
      const status = await this.graphGet<{ status_code?: string }>(`/${creationId}`, accessToken, {
        fields: "status_code"
      });

      if (status.status_code === "FINISHED") {
        return;
      }

      if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
        throw new MetaGraphPublishError(`Instagram media container ${creationId} is ${status.status_code}`);
      }

      if (attempt < this.pollAttempts - 1 && this.pollDelayMs > 0) {
        await delay(this.pollDelayMs);
      }
    }

    throw new MetaGraphPublishError(`Instagram media container ${creationId} did not finish processing`);
  }

  private async graphPost<TResponse>(path: string, accessToken: string, body: Record<string, string>): Promise<TResponse> {
    const url = this.graphUrl(path);
    const payload = new URLSearchParams({
      ...body,
      access_token: accessToken
    });
    const response = await this.fetchImpl(url, {
      body: payload,
      method: "POST"
    });

    return parseGraphResponse<TResponse>(response);
  }

  private async graphGet<TResponse>(path: string, accessToken: string, query: Record<string, string>): Promise<TResponse> {
    const url = new URL(this.graphUrl(path));

    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    url.searchParams.set("access_token", accessToken);

    return parseGraphResponse<TResponse>(await this.fetchImpl(url));
  }

  private graphUrl(path: string): string {
    return `${this.graphBaseUrl}/${this.graphVersion}${path}`;
  }
}

export function createInstagramPublisher(): InstagramPublisher {
  return env.INSTAGRAM_PUBLISH_MODE === "live" ? new MetaGraphInstagramPublisher() : new DryRunInstagramPublisher();
}

export function buildCaption(contentItem: ContentItem): string {
  const caption = contentItem.captionEn ?? contentItem.captionAr ?? "";
  const hashtags = contentItem.hashtags.join(" ");

  return [caption, hashtags].filter(Boolean).join("\n\n");
}

async function parseGraphResponse<TResponse>(response: Response): Promise<TResponse> {
  const body = (await response.json().catch(() => undefined)) as { error?: { message?: string }; id?: string } | undefined;

  if (!response.ok) {
    throw new MetaGraphPublishError(body?.error?.message ?? `Meta Graph request failed with ${response.status}`);
  }

  return body as TResponse;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
