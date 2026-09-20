import type { Prisma, MediaAsset } from "@prisma/client";
import { contentAggregateInclude, type ContentAggregateRow } from "../content/content-aggregate";
import { captionValidationIssue, contentMediaIssue, type ContentMediaIssue } from "@markos/shared-types";

type ContentMediaFailureCode = ContentMediaIssue | "CONTENT_LOCKED" | "CONTENT_NOT_FOUND" | "CONTENT_MEDIA_CHANGED";
const messages: Record<ContentMediaFailureCode, string> = {
  CONTENT_MEDIA_CHANGED: "The media changed while you were editing. Review the current slides and try again.",
  CONTENT_LOCKED: "Media cannot be attached because this post is no longer a draft.",
  CONTENT_NOT_FOUND: "Media cannot be attached because this post is no longer available.",
  CONTENT_MEDIA_SINGLE_ITEM_LIMIT:
    "Only carousels can contain multiple media items. Remove the existing media before adding another or changing the content type.",
  CONTENT_MEDIA_CAROUSEL_LIMIT: "A carousel can contain at most ten images. Remove an image before adding another.",
  CONTENT_MEDIA_TYPE_INCOMPATIBLE:
    "This media format is not supported for the selected content type. Posts and carousels use JPEG images; Reels use MP4 video; Stories use either.",
  CONTENT_MEDIA_REQUIRED: "Attach one compatible media item before marking this post Ready.",
  CONTENT_MEDIA_CAROUSEL_MINIMUM: "Attach at least two JPEG images before marking a carousel Ready.",
  CONTENT_MEDIA_UNAVAILABLE: "One or more attached media items are unavailable. Remove them before continuing."
};

export class ContentMediaValidationError extends Error {
  constructor(
    readonly code: ContentMediaFailureCode,
    readonly mediaAssetId?: string
  ) {
    super(messages[code] + (mediaAssetId ? " The generated file is saved in the Media Library and was not attached to this post." : ""));
  }
}

/** Lock the aggregate before checking a generation result or scheduling mutation. */
export async function lockContentForMedia(tx: Prisma.TransactionClient, workspaceId: string, contentItemId: string): Promise<ContentAggregateRow | null> {
  await tx.$queryRaw`SELECT "id" FROM "content_items" WHERE "id" = ${contentItemId}::uuid AND "workspaceId" = ${workspaceId}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
  return tx.contentItem.findFirst({ where: { id: contentItemId, workspaceId, deletedAt: null }, include: contentAggregateInclude });
}

export function readinessIssue(
  content: Pick<ContentAggregateRow, "contentType" | "caption" | "mediaItems">,
  assets: Pick<MediaAsset, "id" | "mimeType">[]
): string | null {
  if (content.contentType !== "STORY") {
    if (!content.caption.trim()) return "CONTENT_CAPTION_REQUIRED";
    const captionIssue = captionValidationIssue(content.caption);
    if (captionIssue) return captionIssue === "length" ? "CONTENT_CAPTION_TOO_LONG" : "CONTENT_CAPTION_TOO_MANY_HASHTAGS";
  }
  if (content.mediaItems.some((item) => !item.mediaAssetId)) return "CONTENT_MEDIA_REQUIRED";
  const ids = content.mediaItems.map((item) => item.mediaAssetId!);
  const issue = contentMediaIssue(content.contentType, ids, assets, true);
  if (issue) return issue;
  if (
    content.mediaItems.some(
      (item) =>
        assets.find((asset) => asset.id === item.mediaAssetId)?.mimeType !==
        (item.mediaKind === "VIDEO" ? "video/mp4" : item.mediaKind === "IMAGE" ? "image/jpeg" : "")
    )
  )
    return "CONTENT_MEDIA_TYPE_INCOMPATIBLE";
  return null;
}
export async function assertContentReady(tx: Prisma.TransactionClient, content: ContentAggregateRow): Promise<void> {
  const assets = await tx.mediaAsset.findMany({
    where: {
      workspaceId: content.workspaceId,
      deletedAt: null,
      id: { in: content.mediaItems.flatMap((item) => (item.mediaAssetId ? [item.mediaAssetId] : [])) }
    }
  });
  const issue = readinessIssue(content, assets);
  if (issue) throw Object.assign(new Error(issue), { code: issue, statusCode: 409 });
}
