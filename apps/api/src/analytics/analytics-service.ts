import type { ContentItem, InstagramAnalytics } from "@prisma/client";
import type {
  AnalyticsLearningResult,
  AnalyticsLiveReadiness,
  AnalyticsMetricTotals,
  AnalyticsSummary,
  AnalyticsSyncResult,
  InstagramAnalyticsRecord,
  InstagramMetricType,
  Locale
} from "@markos/shared-types";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { hasCanonicalReleaseScopeSet, INSTAGRAM_RELEASE_SCOPES } from "../config/instagram-contract";
import { upsertVaultSection } from "../vault/vault-service";
import { createInstagramAnalyticsProvider, InstagramAnalyticsProviderError, type InstagramAnalyticsProvider } from "./instagram-analytics-provider";
import { getSecureInstagramConnection, withSecureInstagramCredential } from "../workspace/instagram-connection-service";

export class AnalyticsWorkspaceNotFoundError extends Error {
  constructor() {
    super("Workspace was not found");
  }
}

export interface AnalyticsSyncForAllWorkspacesResult {
  attempted: number;
  results: AnalyticsSyncResult[];
}

const analyticsRequiredEnv = [
  "INSTAGRAM_ANALYTICS_SYNC_MODE",
  "INSTAGRAM_APP_ID",
  "INSTAGRAM_APP_SECRET",
  "INSTAGRAM_OAUTH_REDIRECT_URI",
  "INSTAGRAM_OAUTH_STATE_SECRET",
  "INSTAGRAM_TOKEN_ENCRYPTION_KEY",
  "INSTAGRAM_GRAPH_VERSION",
  "INSTAGRAM_OAUTH_SCOPES"
];
const analyticsRequiredScopes = [...INSTAGRAM_RELEASE_SCOPES];

export async function getAnalyticsSummary(workspaceId: string, input: { days?: number; from?: Date; to?: Date } = {}): Promise<AnalyticsSummary> {
  const range = analyticsRange(input);
  const rows = await prisma.instagramAnalytics.findMany({
    orderBy: [{ dataDate: "desc" }, { updatedAt: "desc" }],
    where: {
      workspaceId,
      dataDate: {
        gte: range.from,
        lte: range.to
      },
      deletedAt: null
    }
  });
  const records = rows.map(toInstagramAnalyticsRecord);
  const contentItems = await prisma.contentItem.findMany({
    where: {
      id: {
        in: [...new Set(records.map((record) => record.contentItemId).filter((id): id is string => id !== undefined))]
      },
      workspaceId
    }
  });
  const contentById = new Map(contentItems.map((item) => [item.id, item]));

  return {
    byMetricType: summarizeByMetricType(records),
    daily: summarizeDaily(records),
    days: range.days,
    from: range.from.toISOString(),
    ...(records[0] === undefined ? {} : { latestSyncedAt: records[0].syncedAt }),
    records,
    topContent: summarizeTopContent(records, contentById),
    to: range.to.toISOString(),
    totals: summarizeMetrics(records)
  };
}

export async function getAnalyticsLiveReadiness(workspaceId: string): Promise<AnalyticsLiveReadiness> {
  const workspace = await prisma.workspace.findFirst({
    where: {
      deletedAt: null,
      id: workspaceId
    }
  });

  if (!workspace) {
    throw new AnalyticsWorkspaceNotFoundError();
  }

  const reasons: string[] = [];

  if (env.INSTAGRAM_ANALYTICS_SYNC_MODE !== "live") {
    reasons.push("INSTAGRAM_ANALYTICS_SYNC_MODE_NOT_LIVE");
  }

  for (const key of analyticsRequiredEnv) {
    if (!hasConfiguredEnv(key)) {
      reasons.push(`MISSING_${key}`);
    }
  }

  const configuredScopes = new Set(env.INSTAGRAM_OAUTH_SCOPES);

  for (const scope of analyticsRequiredScopes) {
    if (!configuredScopes.has(scope)) {
      reasons.push(`MISSING_SCOPE_${scope.toUpperCase()}`);
    }
  }

  const connection = await getSecureInstagramConnection(workspaceId);

  if (!connection.connected) {
    reasons.push("INSTAGRAM_NOT_CONNECTED");
  }

  if (connection.status === "REAUTHORIZE_REQUIRED") {
    reasons.push("INSTAGRAM_TOKEN_EXPIRED");
  }

  if (connection.connected && !hasCanonicalReleaseScopeSet(connection.requestedScopes ?? [])) {
    reasons.push("INSTAGRAM_RECONNECT_REQUIRED_FOR_RELEASE_SCOPES");
  }

  return {
    connection,
    mode: env.INSTAGRAM_ANALYTICS_SYNC_MODE,
    ready: reasons.length === 0,
    reasons,
    requiredEnv: analyticsRequiredEnv,
    requiredScopes: analyticsRequiredScopes,
    graphVersion: env.INSTAGRAM_GRAPH_VERSION
  };
}

export async function exportMonthlyAnalyticsPdf(
  workspaceId: string,
  input: { locale?: Locale; month?: string; now?: Date } = {}
): Promise<{ bytes: Buffer; filename: string; month: string }> {
  const workspace = await prisma.workspace.findFirst({
    where: {
      deletedAt: null,
      id: workspaceId
    }
  });

  if (!workspace) {
    throw new AnalyticsWorkspaceNotFoundError();
  }

  const month = input.month ?? monthKey(input.now ?? new Date());
  const { from, to } = monthDateRange(month);
  const summary = await getAnalyticsSummary(workspaceId, { from, to });

  return {
    bytes: buildAnalyticsPdf({
      locale: input.locale ?? "en",
      month,
      summary,
      workspaceName: workspace.name
    }),
    filename: `markos-analytics-${slugForFilename(workspace.name)}-${month}.pdf`,
    month
  };
}

export async function syncInstagramAnalytics(
  workspaceId: string,
  options: { days?: number; now?: Date; provider?: InstagramAnalyticsProvider } = {}
): Promise<AnalyticsSyncResult> {
  const days = clampDays(options.days ?? 30);
  const to = options.now ?? new Date();
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      deletedAt: null
    }
  });

  if (!workspace) {
    throw new AnalyticsWorkspaceNotFoundError();
  }

  const contentItems = await prisma.contentItem.findMany({
    orderBy: {
      publishedAt: "desc"
    },
    where: {
      workspaceId,
      deletedAt: null,
      instagramPostId: {
        not: null
      },
      publishedAt: {
        gte: dayStart(from),
        lte: endOfDay(to)
      },
      status: "PUBLISHED"
    }
  });
  const provider = options.provider ?? createInstagramAnalyticsProvider();

  if (provider.mode === "live") {
    const connection = await getSecureInstagramConnection(workspaceId);

    if (connection.connected && !hasCanonicalReleaseScopeSet(connection.requestedScopes ?? [])) {
      throw new InstagramAnalyticsProviderError("INSTAGRAM_RECONNECT_REQUIRED_FOR_RELEASE_SCOPES");
    }
  }

  const providerWorkspace = await withSecureInstagramCredential(workspace);
  const snapshots = await provider.syncWorkspace({
    contentItems,
    from: dayStart(from),
    to: dayStart(to),
    workspace: providerWorkspace
  });
  const syncedAt = options.now ?? new Date();
  const records: InstagramAnalyticsRecord[] = [];
  const allowedContentItemIds = new Set(contentItems.map((item) => item.id));

  if (snapshots.some((snapshot) => snapshot.contentItemId !== undefined && !allowedContentItemIds.has(snapshot.contentItemId))) {
    throw new InstagramAnalyticsProviderError("INSTAGRAM_ANALYTICS_CONTENT_SCOPE_INVALID");
  }

  for (const snapshot of snapshots) {
    const existing = await prisma.instagramAnalytics.findFirst({
      where: {
        contentItemId: snapshot.contentItemId ?? null,
        dataDate: snapshot.dataDate,
        deletedAt: null,
        metricType: snapshot.metricType,
        workspaceId
      }
    });
    const row =
      existing === null
        ? await prisma.instagramAnalytics.create({
            data: {
              ...(snapshot.contentItemId === undefined ? {} : { contentItemId: snapshot.contentItemId }),
              dataDate: snapshot.dataDate,
              metricType: snapshot.metricType,
              metrics: snapshot.metrics,
              syncedAt,
              workspaceId
            }
          })
        : await prisma.instagramAnalytics.update({
            data: {
              metrics: snapshot.metrics,
              syncedAt
            },
            where: {
              id: existing.id
            }
          });

    records.push(toInstagramAnalyticsRecord(row));
  }
  const learning = await writeAnalyticsLearningToVault(workspaceId, { days, now: syncedAt });

  return {
    created: records.length,
    from: dayStart(from).toISOString(),
    learning,
    mode: provider.mode,
    records,
    to: dayStart(to).toISOString(),
    workspaceId
  };
}

export async function writeAnalyticsLearningToVault(workspaceId: string, input: { days?: number; now?: Date } = {}): Promise<AnalyticsLearningResult> {
  const days = clampDays(input.days ?? 30);
  const summary = await getAnalyticsSummary(workspaceId, { days, to: input.now ?? new Date() });
  const key = analyticsLearningKey(summary);
  const observations = buildAnalyticsObservations(summary);
  const saved = await upsertVaultSection(workspaceId, "OBJECTIVES", {
    entries: [
      {
        key,
        value: {
          generatedAt: (input.now ?? new Date()).toISOString(),
          kind: "ANALYTICS_PERFORMANCE_LEARNING",
          metricBuckets: summary.byMetricType.map((bucket) => ({
            metricType: bucket.metricType,
            totals: bucket.totals
          })),
          observations,
          period: {
            days: summary.days,
            from: summary.from,
            to: summary.to
          },
          topContent: summary.topContent.slice(0, 5).map((item) => ({
            caption: item.caption ?? null,
            contentItemId: item.contentItemId,
            contentType: item.contentType,
            dataDate: item.dataDate,
            engagement: item.engagement,
            metrics: item.metrics
          })),
          totals: summary.totals
        }
      }
    ]
  });
  const entry = saved[0];

  if (entry === undefined) {
    throw new Error("Analytics learning Vault write did not return an entry");
  }

  return {
    entry,
    key,
    observations,
    recordCount: summary.records.length,
    topContentCount: summary.topContent.length,
    workspaceId
  };
}

export async function syncInstagramAnalyticsForAllWorkspaces(
  options: { days?: number; now?: Date; provider?: InstagramAnalyticsProvider; workspaceIds?: string[] } = {}
): Promise<AnalyticsSyncForAllWorkspacesResult> {
  const connections = await prisma.instagramConnectionCredential.findMany({
    where: {
      deletedAt: null,
      status: "CONNECTED",
      ...(options.workspaceIds === undefined
        ? {}
        : {
            workspaceId: {
              in: options.workspaceIds
            }
          }),
      tokenExpiresAt: {
        gt: options.now ?? new Date()
      }
    },
    select: { workspaceId: true }
  });
  const results: AnalyticsSyncResult[] = [];

  for (const connection of connections) {
    try {
      results.push(
        await syncInstagramAnalytics(connection.workspaceId, {
          ...(options.days === undefined ? {} : { days: options.days }),
          ...(options.now === undefined ? {} : { now: options.now }),
          ...(options.provider === undefined ? {} : { provider: options.provider })
        })
      );
    } catch (error) {
      if (!(error instanceof InstagramAnalyticsProviderError)) {
        throw error;
      }
    }
  }

  return {
    attempted: results.length,
    results
  };
}

function toInstagramAnalyticsRecord(row: InstagramAnalytics): InstagramAnalyticsRecord {
  return {
    createdAt: row.createdAt.toISOString(),
    dataDate: row.dataDate.toISOString(),
    ...(row.contentItemId === null ? {} : { contentItemId: row.contentItemId }),
    id: row.id,
    metricType: row.metricType,
    metrics: isRecord(row.metrics) ? row.metrics : {},
    syncedAt: row.syncedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    workspaceId: row.workspaceId
  };
}

function emptyTotals(): AnalyticsMetricTotals {
  return {
    comments: null,
    engagement: null,
    followers: null,
    impressions: null,
    likes: null,
    profileViews: null,
    reach: null,
    saves: null,
    shares: null,
    views: null
  };
}

function summarizeMetrics(records: InstagramAnalyticsRecord[]): AnalyticsMetricTotals {
  const totals = emptyTotals();

  for (const record of records) {
    for (const key of Object.keys(totals) as Array<keyof AnalyticsMetricTotals>) {
      const value = record.metrics[key];

      if (typeof value === "number") {
        totals[key] = (totals[key] ?? 0) + value;
      }
    }
  }

  if (totals.engagement === null) {
    const engagementParts = [totals.likes, totals.comments, totals.shares, totals.saves];

    if (engagementParts.some((value) => value !== null)) {
      totals.engagement = engagementParts.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    }
  }

  return totals;
}

function summarizeByMetricType(records: InstagramAnalyticsRecord[]): AnalyticsSummary["byMetricType"] {
  const grouped = new Map<InstagramMetricType, InstagramAnalyticsRecord[]>();

  for (const record of records) {
    grouped.set(record.metricType, [...(grouped.get(record.metricType) ?? []), record]);
  }

  return [...grouped.entries()]
    .map(([metricType, metricRecords]) => ({
      metricType,
      totals: summarizeMetrics(metricRecords)
    }))
    .sort((left, right) => left.metricType.localeCompare(right.metricType));
}

function summarizeDaily(records: InstagramAnalyticsRecord[]): AnalyticsSummary["daily"] {
  const grouped = new Map<string, InstagramAnalyticsRecord[]>();

  for (const record of records) {
    const key = dayStart(new Date(record.dataDate)).toISOString();
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }

  return [...grouped.entries()]
    .map(([dataDate, dateRecords]) => ({
      dataDate,
      totals: summarizeMetrics(dateRecords)
    }))
    .sort((left, right) => left.dataDate.localeCompare(right.dataDate));
}

function summarizeTopContent(records: InstagramAnalyticsRecord[], contentById: Map<string, ContentItem>): AnalyticsSummary["topContent"] {
  return records
    .filter((record) => record.contentItemId !== undefined)
    .map((record) => {
      const totals = summarizeMetrics([record]);
      const contentItem = contentById.get(record.contentItemId ?? "");
      const caption = contentItem?.captionEn ?? contentItem?.captionAr ?? undefined;

      return {
        ...(caption === undefined ? {} : { caption }),
        contentItemId: record.contentItemId ?? "",
        contentType: contentItem?.contentType ?? "POST",
        dataDate: record.dataDate,
        engagement: totals.engagement,
        metrics: totals
      };
    })
    .filter((item) => item.engagement !== null)
    .sort((left, right) => (right.engagement ?? -1) - (left.engagement ?? -1))
    .slice(0, 10);
}

function analyticsLearningKey(summary: AnalyticsSummary): string {
  return `analytics.performance.${summary.from.slice(0, 10)}.${summary.to.slice(0, 10)}`;
}

function buildAnalyticsObservations(summary: AnalyticsSummary): string[] {
  const observations: string[] = [];
  const totals = summary.totals;
  const previousDaily = summary.daily.at(-2);
  const latestDaily = summary.daily.at(-1);
  const strongestBucket = [...summary.byMetricType]
    .filter((bucket) => bucket.totals.engagement !== null)
    .sort((left, right) => (right.totals.engagement ?? -1) - (left.totals.engagement ?? -1))[0];
  const bestContent = summary.topContent[0];

  if (summary.records.length === 0 || !Object.values(totals).some((value) => value !== null)) {
    return ["No Instagram analytics were available for this window; future recommendations should ask for fresh sync data."];
  }

  observations.push(
    `Performance window captured ${summary.records.length} analytics records with reach ${metricText(totals.reach)}, impressions ${metricText(totals.impressions)}, and engagement ${metricText(totals.engagement)}.`
  );

  if (bestContent !== undefined) {
    observations.push(
      `Top content was ${bestContent.contentType} ${bestContent.contentItemId} with engagement ${metricText(bestContent.engagement)} and reach ${metricText(bestContent.metrics.reach)}.`
    );
  }

  if (strongestBucket !== undefined) {
    observations.push(`${strongestBucket.metricType} metrics were the strongest engagement bucket at ${metricText(strongestBucket.totals.engagement)}.`);
  }

  if (previousDaily !== undefined && latestDaily !== undefined && previousDaily.totals.reach !== null && latestDaily.totals.reach !== null) {
    const delta = latestDaily.totals.reach - previousDaily.totals.reach;
    const direction = delta >= 0 ? "increased" : "decreased";
    observations.push(`Latest daily reach ${direction} by ${Math.abs(delta)} compared with the prior metric day.`);
  }

  return observations;
}

function metricText(value: number | null): string {
  return value === null ? "unavailable" : String(value);
}

function clampDays(days: number): number {
  return Math.min(Math.max(Math.trunc(days), 1), 90);
}

function analyticsRange(input: { days?: number; from?: Date; to?: Date }): { days: number; from: Date; to: Date } {
  const to = dayStart(input.to ?? new Date());

  if (input.from !== undefined) {
    const from = dayStart(input.from);
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1);

    return {
      days,
      from,
      to
    };
  }

  const days = clampDays(input.days ?? 30);
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

  return {
    days,
    from,
    to
  };
}

function monthDateRange(month: string): { from: Date; to: Date } {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;

  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new Error("Invalid analytics report month");
  }

  return {
    from: new Date(Date.UTC(year, monthIndex, 1)),
    to: new Date(Date.UTC(year, monthIndex + 1, 0))
  };
}

function monthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function dayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfDay(date: Date): Date {
  const start = dayStart(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasConfiguredEnv(key: string): boolean {
  const value = process.env[key];
  return typeof value === "string" && value.trim().length > 0;
}

function buildAnalyticsPdf(input: { locale: Locale; month: string; summary: AnalyticsSummary; workspaceName: string }): Buffer {
  const totals = input.summary.totals;
  const labels = pdfLabels(input.locale);
  const lines = [
    "MARKOS AI Monthly Analytics Report",
    `${labels.workspace}: ${input.workspaceName}`,
    `${labels.month}: ${input.month}`,
    `${labels.range}: ${input.summary.from.slice(0, 10)} to ${input.summary.to.slice(0, 10)}`,
    `${labels.generated}: ${new Date().toISOString().slice(0, 10)}`,
    "",
    labels.overview,
    `${labels.followers}: ${metricText(totals.followers)}`,
    `${labels.profileViews}: ${metricText(totals.profileViews)}`,
    `${labels.reach}: ${metricText(totals.reach)}`,
    `${labels.impressions}: ${metricText(totals.impressions)}`,
    `${labels.views}: ${metricText(totals.views)}`,
    `${labels.engagement}: ${metricText(totals.engagement)}`,
    `${labels.likes}: ${metricText(totals.likes)}`,
    `${labels.comments}: ${metricText(totals.comments)}`,
    `${labels.shares}: ${metricText(totals.shares)}`,
    `${labels.saves}: ${metricText(totals.saves)}`,
    "",
    labels.metricBuckets,
    ...input.summary.byMetricType.map(
      (bucket) => `- ${bucket.metricType}: ${labels.reach} ${metricText(bucket.totals.reach)}, ${labels.engagement} ${metricText(bucket.totals.engagement)}`
    ),
    "",
    labels.topContent,
    ...(input.summary.topContent.length === 0
      ? [`- ${labels.noTopContent}`]
      : input.summary.topContent.map(
          (item) =>
            `- ${item.caption ?? item.contentType}: ${labels.engagement} ${metricText(item.engagement)}, ${labels.reach} ${metricText(item.metrics.reach)}`
        )),
    "",
    labels.dailyReach,
    ...(input.summary.daily.length === 0
      ? [`- ${labels.noDailyData}`]
      : input.summary.daily.map((row) => `- ${row.dataDate.slice(0, 10)}: ${metricText(row.totals.reach)}`))
  ];
  const pages = paginatePdfLines(
    lines.map((line) => sanitizePdfText(line ?? "")),
    42
  );
  const objects: string[] = [];
  const addObject = (body: string): number => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("PAGES_PLACEHOLDER");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds: number[] = [];

  for (const pageLines of pages) {
    const stream = buildPdfContentStream(pageLines);
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  return assemblePdf(objects, catalogId);
}

function pdfLabels(locale: Locale): Record<string, string> {
  if (locale === "ar") {
    return {
      comments: "Comments",
      dailyReach: "Daily reach",
      engagement: "Engagement",
      followers: "Followers",
      generated: "Generated",
      impressions: "Impressions",
      likes: "Likes",
      metricBuckets: "Metric buckets",
      month: "Month",
      noDailyData: "No daily metrics for this month",
      noTopContent: "No top content for this month",
      overview: "Overview",
      profileViews: "Profile views",
      range: "Range",
      reach: "Reach",
      saves: "Saves",
      shares: "Shares",
      topContent: "Top content",
      views: "Views",
      workspace: "Workspace"
    };
  }

  return {
    comments: "Comments",
    dailyReach: "Daily reach",
    engagement: "Engagement",
    followers: "Followers",
    generated: "Generated",
    impressions: "Impressions",
    likes: "Likes",
    metricBuckets: "Metric buckets",
    month: "Month",
    noDailyData: "No daily metrics for this month",
    noTopContent: "No top content for this month",
    overview: "Overview",
    profileViews: "Profile views",
    range: "Range",
    reach: "Reach",
    saves: "Saves",
    shares: "Shares",
    topContent: "Top content",
    views: "Views",
    workspace: "Workspace"
  };
}

function paginatePdfLines(lines: string[], pageSize: number): string[][] {
  const pages: string[][] = [];

  for (let index = 0; index < lines.length; index += pageSize) {
    pages.push(lines.slice(index, index + pageSize));
  }

  return pages.length === 0 ? [["MARKOS AI Monthly Analytics Report"]] : pages;
}

function buildPdfContentStream(lines: string[]): string {
  const commands = ["BT", "/F1 11 Tf", "50 742 Td", "14 TL"];

  for (const line of lines) {
    commands.push(`(${escapePdfString(line)}) Tj`, "T*");
  }

  commands.push("ET");
  return commands.join("\n");
}

function assemblePdf(objects: string[], catalogId: number): Buffer {
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];

  for (const [index, body] of objects.entries()) {
    offsets.push(Buffer.byteLength(chunks.join(""), "utf8"));
    chunks.push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  }

  const xrefOffset = Buffer.byteLength(chunks.join(""), "utf8");
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");

  for (const offset of offsets.slice(1)) {
    chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }

  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`);
  chunks.push(`startxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.from(chunks.join(""), "utf8");
}

function sanitizePdfText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "?")
    .slice(0, 110);
}

function escapePdfString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function slugForFilename(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug.length === 0 ? "workspace" : slug;
}
