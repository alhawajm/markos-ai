import type { ContentItem, Workspace } from "@prisma/client";
import { env } from "../config/env";

export interface InstagramAnalyticsSnapshot {
  contentItemId?: string;
  dataDate: Date;
  metricType: "ACCOUNT" | "AUDIENCE" | "POST" | "REEL" | "STORY";
  metrics: Record<string, number | string>;
}

export interface InstagramAnalyticsProvider {
  readonly mode: "dry_run" | "live";
  syncWorkspace(input: { contentItems: ContentItem[]; from: Date; to: Date; workspace: Workspace }): Promise<InstagramAnalyticsSnapshot[]>;
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class DryRunInstagramAnalyticsProvider implements InstagramAnalyticsProvider {
  readonly mode = "dry_run" as const;

  async syncWorkspace(input: { contentItems: ContentItem[]; from: Date; to: Date; workspace: Workspace }): Promise<InstagramAnalyticsSnapshot[]> {
    const snapshots: InstagramAnalyticsSnapshot[] = [
      {
        dataDate: dayStart(input.to),
        metricType: "ACCOUNT",
        metrics: {
          followers: 1240 + input.contentItems.length * 3,
          impressions: input.contentItems.length * 420,
          reach: input.contentItems.length * 260
        }
      }
    ];

    for (const item of input.contentItems) {
      const seed = numericSeed(item.id);
      const metricType = item.contentType === "REEL" ? "REEL" : item.contentType === "STORY" ? "STORY" : "POST";

      snapshots.push({
        contentItemId: item.id,
        dataDate: dayStart(item.publishedAt ?? input.to),
        metricType,
        metrics: {
          comments: seed % 11,
          impressions: 180 + (seed % 400),
          likes: 20 + (seed % 90),
          reach: 120 + (seed % 260),
          saves: seed % 17,
          shares: seed % 13,
          views: item.contentType === "REEL" ? 350 + (seed % 900) : 0
        }
      });
    }

    return snapshots;
  }
}

export class MetaGraphInstagramAnalyticsProvider implements InstagramAnalyticsProvider {
  readonly mode = "live" as const;
  private readonly fetchImpl: FetchLike;
  private readonly graphBaseUrl: string;
  private readonly graphVersion: string;

  constructor(options: { fetchImpl?: FetchLike; graphBaseUrl?: string; graphVersion?: string } = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.graphBaseUrl = (options.graphBaseUrl ?? env.META_GRAPH_BASE_URL).replace(/\/$/, "");
    this.graphVersion = options.graphVersion ?? env.META_GRAPH_VERSION;
  }

  async syncWorkspace(input: { contentItems: ContentItem[]; from: Date; to: Date; workspace: Workspace }): Promise<InstagramAnalyticsSnapshot[]> {
    const accessToken = input.workspace.instagramAccessToken;
    const accountId = input.workspace.instagramAccountId;

    if (!accountId || !accessToken) {
      throw new InstagramAnalyticsProviderError("Instagram account connection is missing");
    }

    const account = await this.graphGet<{ followers_count?: number; media_count?: number }>(`/${accountId}`, accessToken, {
      fields: "followers_count,media_count"
    });
    const snapshots: InstagramAnalyticsSnapshot[] = [
      {
        dataDate: dayStart(input.to),
        metricType: "ACCOUNT",
        metrics: {
          followers: account.followers_count ?? 0,
          mediaCount: account.media_count ?? 0
        }
      }
    ];

    for (const item of input.contentItems) {
      if (!item.instagramPostId) {
        continue;
      }

      const metrics = await this.graphGet<{
        data?: Array<{ name?: string; values?: Array<{ value?: number }> }>;
      }>(`/${item.instagramPostId}/insights`, accessToken, {
        metric: "comments,impressions,likes,reach,saved,shares,views"
      });
      const metricType = item.contentType === "REEL" ? "REEL" : item.contentType === "STORY" ? "STORY" : "POST";

      snapshots.push({
        contentItemId: item.id,
        dataDate: dayStart(item.publishedAt ?? input.to),
        metricType,
        metrics: normalizeInsights(metrics.data ?? [])
      });
    }

    return snapshots;
  }

  private async graphGet<TResponse>(path: string, accessToken: string, query: Record<string, string>): Promise<TResponse> {
    const url = new URL(`${this.graphBaseUrl}/${this.graphVersion}${path}`);

    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    url.searchParams.set("access_token", accessToken);
    return parseGraphResponse<TResponse>(await this.fetchImpl(url));
  }
}

export class InstagramAnalyticsProviderError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function createInstagramAnalyticsProvider(): InstagramAnalyticsProvider {
  return env.INSTAGRAM_ANALYTICS_SYNC_MODE === "live" ? new MetaGraphInstagramAnalyticsProvider() : new DryRunInstagramAnalyticsProvider();
}

function normalizeInsights(data: Array<{ name?: string; values?: Array<{ value?: number }> }>): Record<string, number> {
  const output: Record<string, number> = {};

  for (const row of data) {
    if (!row.name) {
      continue;
    }

    output[row.name === "saved" ? "saves" : row.name] = row.values?.[0]?.value ?? 0;
  }

  return output;
}

async function parseGraphResponse<TResponse>(response: Response): Promise<TResponse> {
  const body = (await response.json().catch(() => undefined)) as { error?: { message?: string } } | undefined;

  if (!response.ok) {
    throw new InstagramAnalyticsProviderError(body?.error?.message ?? `Meta Graph request failed with ${response.status}`);
  }

  return body as TResponse;
}

function dayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function numericSeed(value: string): number {
  return [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
}
