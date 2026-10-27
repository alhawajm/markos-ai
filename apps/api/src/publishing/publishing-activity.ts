import type { PublishingActivityPage } from "@markos/shared-types";
import { prisma } from "../db/prisma";
import { contentAggregateInclude, toContentRecord } from "../content/content-aggregate";
import { toPublishJobRecord } from "./publish-job-service";

export async function publishingActivity(
  workspaceId: string,
  input: { status?: "SCHEDULED" | "FAILED" | "PUBLISHED" | undefined; offset: number }
): Promise<PublishingActivityPage> {
  const where = {
    workspaceId,
    deletedAt: null,
    status: { in: input.status ? [input.status] : (["SCHEDULED", "FAILED", "PUBLISHED"] as ("SCHEDULED" | "FAILED" | "PUBLISHED")[]) }
  };
  const [rows, total] = await Promise.all([
    prisma.contentItem.findMany({ where, include: contentAggregateInclude, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: input.offset, take: 20 }),
    prisma.contentItem.count({ where })
  ]);
  const jobs = rows.length
    ? await prisma.publishJob.findMany({
        where: { workspaceId, contentItemId: { in: rows.map((row) => row.id) } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        distinct: ["contentItemId"]
      })
    : [];
  const byContent = new Map(jobs.map((job) => [job.contentItemId, toPublishJobRecord(job)]));
  return {
    items: rows.map((row) => ({ content: toContentRecord(row), job: byContent.get(row.id) ?? null })),
    total,
    ...(input.offset + rows.length < total ? { nextOffset: input.offset + rows.length } : {})
  };
}
