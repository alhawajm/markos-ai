import { Prisma, type ContentReport } from "@prisma/client";
import type { ContentReportInput, ContentReportReceipt, ContentReportRecord, ContentReportReviewInput, ContentReportStatus } from "@markos/shared-types";
import { prisma } from "../db/prisma";
import { withWorkspaceDbContext, type WorkspaceTransactionClient } from "../db/workspace-transaction";
import { createProviderFetchUrl } from "../media/storage-service";

export class ContentReportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}
const receipt = (row: ContentReport): ContentReportReceipt => ({ id: row.id, status: row.status, createdAt: row.createdAt.toISOString() });
const record = (row: ContentReport): ContentReportRecord => ({
  ...receipt(row),
  workspaceId: row.workspaceId,
  source: row.source,
  sourceId: row.sourceId,
  reason: row.reason,
  note: row.note,
  excerpt: row.excerpt,
  mediaAssetIds: row.mediaAssetIds,
  resolutionNote: row.resolutionNote,
  reviewedAt: row.reviewedAt?.toISOString() ?? null
});
const text = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join("\n\n").slice(0, 4000);
const missing = () => new ContentReportError("REPORT_SOURCE_NOT_FOUND", "The reported content is no longer available in this workspace.", 404);

async function snapshot(tx: WorkspaceTransactionClient, workspaceId: string, input: ContentReportInput) {
  if (input.source === "GENERAL_AI") return { excerpt: "", mediaAssetIds: [] as string[] };
  if (input.source === "CONTENT") {
    const item = await tx.contentItem.findFirst({
      where: { id: input.sourceId!, workspaceId, deletedAt: null },
      include: { mediaItems: { where: { workspaceId, deletedAt: null }, orderBy: { position: "asc" }, take: 10 } }
    });
    if (!item) throw missing();
    return {
      excerpt: text([item.caption, ...item.mediaItems.flatMap((m) => [m.title, m.body, m.visualDirection])]),
      mediaAssetIds: item.mediaItems.flatMap((m) => (m.mediaAssetId ? [m.mediaAssetId] : []))
    };
  }
  if (input.source === "ASSISTANT_MESSAGE") {
    const message = await tx.conversationMessage.findFirst({
      where: { id: input.sourceId!, workspaceId, role: "assistant", conversation: { contentItem: { workspaceId, deletedAt: null } } }
    });
    if (!message) throw missing();
    return { excerpt: text([message.text]), mediaAssetIds: [] as string[] };
  }
  const campaign = await tx.campaign.findFirst({ where: { id: input.sourceId!, workspaceId, deletedAt: null } });
  if (!campaign) throw missing();
  // The brief and generated plan help investigate; uploaded document extracts and signed URLs are excluded.
  const plan = typeof campaign.content === "object" && campaign.content !== null && !Array.isArray(campaign.content) ? campaign.content : {};
  return { excerpt: text([campaign.title, campaign.objective, typeof plan.strategy === "string" ? plan.strategy : ""]), mediaAssetIds: [] as string[] };
}

export async function submitContentReport(workspaceId: string, reportedById: string, input: ContentReportInput): Promise<ContentReportReceipt> {
  const key = { workspaceId_reportedById_requestId: { workspaceId, reportedById, requestId: input.requestId } };
  function replay(row: ContentReport) {
    if (row.source !== input.source || row.sourceId !== (input.sourceId ?? null) || row.reason !== input.reason || row.note !== input.note)
      throw new ContentReportError("REPORT_REQUEST_CONFLICT", "This request was already used for a different report.", 409);
    return receipt(row);
  }
  try {
    return await withWorkspaceDbContext(workspaceId, async (tx) => {
      const existing = await tx.contentReport.findUnique({ where: key });
      if (existing) return replay(existing);
      const captured = await snapshot(tx, workspaceId, input);
      return receipt(await tx.contentReport.create({ data: { ...input, sourceId: input.sourceId ?? null, workspaceId, reportedById, ...captured } }));
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const row = await withWorkspaceDbContext(workspaceId, (tx) => tx.contentReport.findUnique({ where: key }));
      if (row) return replay(row);
    }
    throw error;
  }
}

// Cross-workspace access is limited to the platform moderation routes, with explicit role checks.
export async function listContentReports(status: ContentReportStatus, limit: number): Promise<ContentReportRecord[]> {
  return (await prisma.contentReport.findMany({ where: { status }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: limit })).map(record);
}
export async function contentReportMedia(id: string): Promise<import("@markos/shared-types").ContentReportMedia[]> {
  const report = await prisma.contentReport.findUnique({ where: { id } });
  if (!report) throw new ContentReportError("REPORT_NOT_FOUND", "Report not found.", 404);
  const assets = await prisma.mediaAsset.findMany({ where: { workspaceId: report.workspaceId, id: { in: report.mediaAssetIds }, deletedAt: null }, take: 10 });
  return Promise.all(
    assets.map(async (asset) => ({
      id: asset.id,
      filename: asset.filename,
      url: await createProviderFetchUrl({ workspaceId: report.workspaceId, storageKey: asset.s3Key, publicUrl: asset.cdnUrl })
    }))
  );
}
export async function reviewContentReport(id: string, actorId: string, input: ContentReportReviewInput): Promise<ContentReportRecord> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.contentReport.findUnique({ where: { id } });
    if (!row) throw new ContentReportError("REPORT_NOT_FOUND", "Report not found.", 404);
    const updated = await tx.contentReport.updateMany({
      where: { id, status: "OPEN" },
      data: { status: input.status, resolutionNote: input.note, reviewedById: actorId, reviewedAt: new Date() }
    });
    if (!updated.count) throw new ContentReportError("REPORT_ALREADY_REVIEWED", "This report was already reviewed. Refresh the list.", 409);
    await tx.auditLog.create({
      data: {
        workspaceId: row.workspaceId,
        actorId,
        action: "CONTENT_REPORT_REVIEWED",
        targetType: "ContentReport",
        targetId: id,
        metadata: { status: input.status }
      }
    });
    return record(await tx.contentReport.findUniqueOrThrow({ where: { id } }));
  });
}
