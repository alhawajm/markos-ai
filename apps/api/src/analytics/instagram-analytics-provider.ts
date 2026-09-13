import type { ContentItem, Workspace } from "@prisma/client";
import type { AnalyticsSyncDiagnostics } from "@markos/shared-types";
import { env } from "../config/env";
import { InstagramGraphClient, InstagramGraphRequestError } from "../workspace/instagram-graph-client";

export const INSTAGRAM_ACCOUNT_INSIGHT_METRICS = ["reach", "views", "profile_views", "likes", "comments", "shares", "saves", "total_interactions"] as const;
export const INSTAGRAM_MEDIA_INSIGHT_METRICS = ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions"] as const;
export const INSTAGRAM_STORY_INSIGHT_METRICS = ["reach", "views", "shares", "replies", "total_interactions"] as const;

export interface InstagramAnalyticsSnapshot {
  contentItemId?: string;
  dataDate: Date;
  metricType: "ACCOUNT" | "AUDIENCE" | "POST" | "REEL" | "STORY";
  metrics: Record<string, unknown>;
}

export interface InstagramAnalyticsProvider {
  readonly mode: "dry_run" | "live";
  syncWorkspace(input: {
    contentItems: ContentItem[];
    from: Date;
    to: Date;
    workspace: Workspace;
  }): Promise<InstagramAnalyticsSnapshot[] | { snapshots: InstagramAnalyticsSnapshot[]; diagnostics: AnalyticsSyncDiagnostics }>;
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

  async syncWorkspace(input: { contentItems: ContentItem[]; from: Date; to: Date; workspace: Workspace }) {
    const accessToken = input.workspace.instagramAccessToken;
    const accountId = input.workspace.instagramAccountId;
    if (!accountId || !accessToken) throw new InstagramAnalyticsProviderError("INSTAGRAM_NOT_CONNECTED");
    const diagnostics: AnalyticsSyncDiagnostics = { status: "COMPLETE", discovered: 0, synced: 0, linked: 0, warnings: [] };
    const snapshots: InstagramAnalyticsSnapshot[] = [];
    let failedRequests = 0;
    const warn = (stage: string, code: string, metric?: string, mediaId?: string, providerCode?: string | number) => {
      diagnostics.warnings.push({
        stage,
        code,
        ...(metric ? { metric } : {}),
        ...(mediaId ? { mediaId } : {}),
        ...(providerCode === undefined ? {} : { providerCode })
      });
    };
    const get = (id: string, edge: "insights" | "media" | "stories" | undefined, query: Record<string, string>) =>
      this.client.get(id, edge, accessToken, query);
    const failure = (stage: string, error: unknown, metric?: string, mediaId?: string) => {
      failedRequests += 1;
      warn(
        stage,
        error instanceof InstagramGraphRequestError ? error.code : "INSTAGRAM_PROVIDER_RESPONSE_INVALID",
        metric,
        mediaId,
        error instanceof InstagramGraphRequestError ? error.diagnostic.errorCode : undefined
      );
    };
    const insights = async (id: string, metrics: readonly string[], query: Record<string, string>, stage: string): Promise<unknown[]> => {
      const read = async (requested: readonly string[]) => {
        const body = await get(id, "insights", { ...query, metric: requested.join(",") });
        if (!Array.isArray(body.data)) throw new InstagramGraphRequestError("INSTAGRAM_PROVIDER_RESPONSE_INVALID");
        return body.data;
      };
      let data: unknown[] = [];
      try {
        data = await read(metrics);
      } catch (error) {
        // One unsupported metric must not discard the other supported metrics.
        if (metrics.length > 1 && error instanceof InstagramGraphRequestError && String(error.diagnostic.errorCode) === "100") {
          for (const metric of metrics) {
            try {
              data.push(...(await read([metric])));
            } catch (individualError) {
              failure(stage, individualError, metric, stage === "media" ? id : undefined);
            }
          }
        } else {
          failure(stage, error, metrics.join(","), stage === "media" ? id : undefined);
        }
      }
      const normalized = normalizeInsights(data);
      for (const metric of metrics) {
        if (normalized[metricName(metric)] === undefined) warn(stage, "METRIC_UNAVAILABLE", metric, stage === "media" ? id : undefined);
      }
      return data;
    };
    const range = {
      since: String(Math.floor(dayStart(input.from).getTime() / 1000)),
      until: String(Math.floor(Math.min(Date.now(), dayStart(input.to).getTime() + 86_400_000) / 1000)),
      period: "day"
    };
    const accountMetrics = normalizeInsights(await insights(accountId, INSTAGRAM_ACCOUNT_INSIGHT_METRICS, { ...range, metric_type: "total_value" }, "account"));
    snapshots.push({
      dataDate: dayStart(input.to),
      metricType: "ACCOUNT",
      metrics: {
        ...accountMetrics,
        _scope: "account_total",
        _from: dayStart(input.from).toISOString(),
        _to: dayStart(input.to).toISOString()
      }
    });
    // The worker's 30-day sync also supplies the existing default 7-day view.
    // Unique reach must be requested for that exact window, never summed from days.
    const weekFrom = new Date(dayStart(input.to).getTime() - 6 * 86_400_000);
    if (dayStart(input.from) < weekFrom) {
      const weekMetrics = normalizeInsights(
        await insights(
          accountId,
          INSTAGRAM_ACCOUNT_INSIGHT_METRICS,
          { ...range, since: String(weekFrom.getTime() / 1000), metric_type: "total_value" },
          "account"
        )
      );
      snapshots.push({
        dataDate: dayStart(input.to),
        metricType: "ACCOUNT",
        metrics: {
          ...weekMetrics,
          _scope: "account_total",
          _from: weekFrom.toISOString(),
          _to: dayStart(input.to).toISOString()
        }
      });
    }
    try {
      const account = await get(accountId, undefined, { fields: "followers_count" });
      if (typeof account.followers_count === "number" && Number.isFinite(account.followers_count)) {
        snapshots.push({ dataDate: dayStart(input.to), metricType: "ACCOUNT", metrics: { followers: account.followers_count, _scope: "account_current" } });
      } else warn("account", "METRIC_UNAVAILABLE", "followers_count");
    } catch (error) {
      failure("account", error, "followers_count");
    }
    const dailyData = await insights(accountId, ["reach"], { ...range, metric_type: "time_series" }, "account_daily");
    for (const metric of dailyData) {
      if (!isRecord(metric) || metric.name !== "reach" || !Array.isArray(metric.values)) continue;
      for (const entry of metric.values) {
        if (!isRecord(entry) || typeof entry.value !== "number" || !Number.isFinite(entry.value) || typeof entry.end_time !== "string") continue;
        // Meta labels daily buckets by their exclusive end time. Preserve the
        // actual provider boundary; do not replace all days with the sync date.
        const end = new Date(entry.end_time);
        if (!Number.isFinite(end.getTime())) continue;
        const dataDate = dayStart(new Date(end.getTime() - 86_400_000));
        if (dataDate < dayStart(input.from) || dataDate > dayStart(input.to)) continue;
        snapshots.push({ dataDate, metricType: "ACCOUNT", metrics: { reach: entry.value, _scope: "account_day", _periodEnd: end.toISOString() } });
      }
    }
    type Media = {
      id: string;
      type: "POST" | "REEL" | "STORY";
      contentType?: "POST" | "CAROUSEL" | "REEL" | "STORY";
      publishedAt: Date;
      permalink?: string;
      caption?: string;
    };
    const media = new Map<string, Media>();
    for (const edge of ["media", "stories"] as const) {
      let after: string | undefined;
      const seen = new Set<string>();
      for (let page = 0; page < 20; page += 1) {
        try {
          const body = await get(accountId, edge, {
            fields: "id,media_type,media_product_type,timestamp,permalink,caption",
            limit: "100",
            ...(after ? { after } : {})
          });
          if (!Array.isArray(body.data)) throw new InstagramGraphRequestError("INSTAGRAM_PROVIDER_RESPONSE_INVALID");
          for (const value of body.data) {
            if (!isRecord(value) || typeof value.id !== "string" || typeof value.timestamp !== "string") {
              failure("discovery", undefined);
              continue;
            }
            const publishedAt = new Date(value.timestamp);
            if (!Number.isFinite(publishedAt.getTime())) {
              failure("discovery", undefined);
              continue;
            }
            media.set(value.id, {
              id: value.id,
              publishedAt,
              contentType:
                edge === "stories" || value.media_product_type === "STORY"
                  ? "STORY"
                  : value.media_product_type === "REELS"
                    ? "REEL"
                    : value.media_type === "CAROUSEL_ALBUM"
                      ? "CAROUSEL"
                      : "POST",
              type: edge === "stories" || value.media_product_type === "STORY" ? "STORY" : value.media_product_type === "REELS" ? "REEL" : "POST",
              ...(typeof value.caption === "string" ? { caption: value.caption } : {}),
              ...(typeof value.permalink === "string" && /^https:\/\/(www\.)?instagram\.com\//.test(value.permalink) ? { permalink: value.permalink } : {})
            });
          }
          const paging = isRecord(body.paging) ? body.paging : undefined;
          if (!paging?.next) break;
          const cursor = isRecord(paging.cursors) ? paging.cursors.after : undefined;
          if (typeof cursor !== "string" || seen.has(cursor) || page === 19) {
            failure("discovery", undefined);
            warn("discovery", "PAGINATION_INCOMPLETE");
            break;
          }
          seen.add(cursor);
          after = cursor;
        } catch (error) {
          failure("discovery", error);
          break;
        }
      }
    }
    diagnostics.discovered = media.size;
    const linked = new Map(input.contentItems.filter((item) => item.instagramPostId).map((item) => [item.instagramPostId!, item]));
    // Known published IDs also cover stories no longer returned by /stories.
    for (const item of input.contentItems) {
      if (item.instagramPostId && item.publishedAt && !media.has(item.instagramPostId))
        media.set(item.instagramPostId, {
          id: item.instagramPostId,
          publishedAt: item.publishedAt,
          type: item.contentType === "REEL" ? "REEL" : item.contentType === "STORY" ? "STORY" : "POST"
        });
    }
    for (const item of media.values()) {
      const metrics = normalizeInsights(
        await insights(item.id, item.type === "STORY" ? INSTAGRAM_STORY_INSIGHT_METRICS : INSTAGRAM_MEDIA_INSIGHT_METRICS, {}, "media")
      );
      if (!Object.keys(metrics).length) continue;
      diagnostics.synced += 1;
      const local = linked.get(item.id);
      if (local) diagnostics.linked += 1;
      snapshots.push({
        ...(local ? { contentItemId: local.id } : {}),
        dataDate: dayStart(item.publishedAt),
        metricType: item.type,
        metrics: {
          ...metrics,
          _scope: "media_lifetime",
          contentType: item.contentType ?? item.type,
          instagramMediaId: item.id,
          ...(item.permalink ? { permalink: item.permalink } : {}),
          ...(item.caption ? { caption: item.caption } : {})
        }
      });
    }
    const hasMetrics = snapshots.some((snapshot) => Object.values(snapshot.metrics).some((value) => typeof value === "number"));
    diagnostics.status = failedRequests ? (hasMetrics ? "PARTIAL" : "FAILED") : "COMPLETE";
    snapshots[0]!.metrics._sync = diagnostics;
    return { snapshots, diagnostics };
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
  if (value === "total_interactions") return "engagement";
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
