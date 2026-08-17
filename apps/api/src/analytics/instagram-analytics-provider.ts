import type { ContentItem, Workspace } from "@prisma/client";
import { env } from "../config/env";
import { InstagramGraphClient, InstagramGraphRequestError } from "../workspace/instagram-graph-client";

export const INSTAGRAM_ACCOUNT_INSIGHT_METRICS = ["reach", "profile_views"] as const;
export const INSTAGRAM_MEDIA_INSIGHT_METRICS = ["shares", "comments"] as const;

export interface InstagramAnalyticsSnapshot {
  contentItemId?: string;
  dataDate: Date;
  metricType: "ACCOUNT" | "AUDIENCE" | "POST" | "REEL" | "STORY";
  metrics: Record<string, number>;
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

export class InstagramGraphAnalyticsProvider implements InstagramAnalyticsProvider {
  readonly mode = "live" as const;
  private readonly client: InstagramGraphClient;

  constructor(
    options: {
      /** Test-only transport boundary. Production callers must omit it. */
      fetchImpl?: FetchLike;
      /** Test-only timeout boundary. Production callers must omit it. */
      requestTimeoutMs?: number;
    } = {}
  ) {
    this.client = new InstagramGraphClient({
      ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      ...(options.requestTimeoutMs === undefined ? {} : { timeoutMs: options.requestTimeoutMs })
    });
  }

  async syncWorkspace(input: { contentItems: ContentItem[]; from: Date; to: Date; workspace: Workspace }): Promise<InstagramAnalyticsSnapshot[]> {
    const accessToken = input.workspace.instagramAccessToken;
    const accountId = input.workspace.instagramAccountId;

    if (!accountId || !accessToken) {
      throw new InstagramAnalyticsProviderError("INSTAGRAM_NOT_CONNECTED");
    }

    const account = await this.get(accountId, accessToken, {
      metric: INSTAGRAM_ACCOUNT_INSIGHT_METRICS.join(","),
      period: "day"
    });
    const snapshots: InstagramAnalyticsSnapshot[] = [
      {
        dataDate: dayStart(input.to),
        metricType: "ACCOUNT",
        metrics: normalizeInsights(account.data)
      }
    ];

    for (const item of input.contentItems) {
      if (!item.instagramPostId) continue;

      const media = await this.get(item.instagramPostId, accessToken, {
        metric: INSTAGRAM_MEDIA_INSIGHT_METRICS.join(",")
      });
      const metricType = item.contentType === "REEL" ? "REEL" : item.contentType === "STORY" ? "STORY" : "POST";

      snapshots.push({
        contentItemId: item.id,
        dataDate: dayStart(item.publishedAt ?? input.to),
        metricType,
        metrics: normalizeInsights(media.data)
      });
    }

    return snapshots;
  }

  private async get(objectId: string, accessToken: string, query: Record<string, string>): Promise<Record<string, unknown>> {
    try {
      return await this.client.get(objectId, "insights", accessToken, query);
    } catch (error) {
      if (error instanceof InstagramGraphRequestError) {
        throw new InstagramAnalyticsProviderError(error.code, error.diagnostic.retryable);
      }

      throw new InstagramAnalyticsProviderError("INSTAGRAM_PROVIDER_CLIENT_ERROR");
    }
  }
}

export class InstagramAnalyticsProviderError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false
  ) {
    super(code);
  }
}

export function createInstagramAnalyticsProvider(): InstagramAnalyticsProvider {
  return env.INSTAGRAM_ANALYTICS_SYNC_MODE === "live" ? new InstagramGraphAnalyticsProvider() : new DryRunInstagramAnalyticsProvider();
}

export function normalizeInsights(value: unknown): Record<string, number> {
  if (!Array.isArray(value)) return {};

  const output: Record<string, number> = {};

  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== "string") continue;
    const latestValueEntry = Array.isArray(item.values) ? item.values.at(-1) : undefined;
    const latestValue = isRecord(latestValueEntry) ? latestValueEntry.value : undefined;
    const totalValue = isRecord(item.total_value) ? item.total_value.value : undefined;
    const metricValue = typeof latestValue === "number" && Number.isFinite(latestValue) ? latestValue : totalValue;

    if (typeof metricValue !== "number" || !Number.isFinite(metricValue)) continue;
    output[metricName(item.name)] = metricValue;
  }

  return output;
}

function metricName(value: string): string {
  if (value === "saved") return "saves";
  if (value === "profile_views") return "profileViews";
  return value;
}

function dayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function numericSeed(value: string): number {
  return [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
