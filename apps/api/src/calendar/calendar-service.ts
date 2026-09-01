import type { ContentStatus, Prisma } from "@prisma/client";
import type { CalendarReadResult } from "@markos/shared-types";
import type { CalendarReadQueryInput } from "@markos/validation";
import { toContentRecord } from "../content/content-service";
import { prisma } from "../db/prisma";
import { toMediaAssetRecord } from "../media/media-service";

const DAY_MS = 86_400_000;
const unscheduledStatuses = ["DRAFT", "IN_REVIEW", "APPROVED"] as const satisfies readonly ContentStatus[];

export async function readWorkspaceCalendar(workspaceId: string, input: CalendarReadQueryInput, now = new Date()): Promise<CalendarReadResult> {
  const range = {
    gte: bahrainDayStart(input.from),
    lt: new Date(bahrainDayStart(input.to).getTime() + DAY_MS)
  };
  const contentTypeWhere = input.contentTypes ? { in: Array.from(new Set(input.contentTypes)) } : undefined;
  const statusWhere = input.statuses ? { in: Array.from(new Set(input.statuses)) } : undefined;
  const sharedWhere: Prisma.ContentItemWhereInput = {
    workspaceId,
    deletedAt: null,
    ...(contentTypeWhere ? { contentType: contentTypeWhere } : {}),
    ...(statusWhere ? { status: statusWhere } : {})
  };

  const matchingUnscheduledStatuses = unscheduledStatuses.filter((status) => !input.statuses || input.statuses.includes(status));
  const unscheduledWhere: Prisma.ContentItemWhereInput = {
    workspaceId,
    deletedAt: null,
    plannedAt: null,
    status: { in: matchingUnscheduledStatuses },
    ...(contentTypeWhere ? { contentType: contentTypeWhere } : {})
  };
  const summaryWhere: Prisma.ContentItemWhereInput = {
    workspaceId,
    deletedAt: null,
    ...(contentTypeWhere ? { contentType: contentTypeWhere } : {})
  };
  const currentWeek = bahrainWeekRange(now);

  const [placedRows, unscheduledTotal, unscheduledRows, scheduledThisWeek, ready, needsAttention] = await Promise.all([
    prisma.contentItem.findMany({
      where: {
        ...sharedWhere,
        OR: [
          { status: "PUBLISHED", publishedAt: range },
          { status: { in: ["SCHEDULED", "FAILED"] }, scheduledAt: range },
          { status: { in: Array.from(unscheduledStatuses) }, plannedAt: range }
        ]
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
    }),
    matchingUnscheduledStatuses.length === 0 ? Promise.resolve(0) : prisma.contentItem.count({ where: unscheduledWhere }),
    matchingUnscheduledStatuses.length === 0
      ? Promise.resolve([])
      : prisma.contentItem.findMany({
          where: unscheduledWhere,
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          skip: input.unscheduledOffset,
          take: input.unscheduledLimit
        }),
    prisma.contentItem.count({
      where: {
        ...summaryWhere,
        status: "SCHEDULED",
        scheduledAt: currentWeek
      }
    }),
    prisma.contentItem.count({ where: { ...summaryWhere, status: "APPROVED" } }),
    prisma.contentItem.count({ where: { ...summaryWhere, status: "FAILED" } })
  ]);

  const rows = [...placedRows, ...unscheduledRows];
  const mediaIds = Array.from(new Set(rows.flatMap((row) => row.mediaIds)));
  const mediaRows =
    mediaIds.length === 0
      ? []
      : await prisma.mediaAsset.findMany({
          where: {
            id: { in: mediaIds },
            workspaceId,
            deletedAt: null
          }
        });
  const nextOffset = input.unscheduledOffset + unscheduledRows.length;

  return {
    range: { from: input.from, to: input.to },
    items: placedRows.map(toContentRecord),
    mediaAssets: mediaRows.map(toMediaAssetRecord),
    summary: {
      scheduledThisWeek,
      ready,
      needsAttention
    },
    unscheduled: {
      items: unscheduledRows.map(toContentRecord),
      total: unscheduledTotal,
      ...(nextOffset < unscheduledTotal ? { nextOffset } : {})
    }
  };
}

function bahrainDayStart(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00+03:00`);
}

function bahrainWeekRange(now: Date): { gte: Date; lt: Date } {
  const dateKey = bahrainDateKey(now);
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  const start = new Date(bahrainDayStart(dateKey).getTime() - weekday * DAY_MS);
  return { gte: start, lt: new Date(start.getTime() + 7 * DAY_MS) };
}

function bahrainDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Bahrain",
    year: "numeric"
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}
