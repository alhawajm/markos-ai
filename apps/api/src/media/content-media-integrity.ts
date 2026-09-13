import type { ContentItem, ContentType, Prisma } from "@prisma/client";
import { contentMediaIssue, type ContentMediaIssue } from "@markos/shared-types";

type ContentMediaFailureCode = ContentMediaIssue | "CONTENT_LOCKED" | "CONTENT_NOT_FOUND";
const messages: Record<ContentMediaFailureCode, string> = {
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

/** All media-list mutations lock the content row before reading its current list. */
export async function lockContentForMedia(tx: Prisma.TransactionClient, workspaceId: string, contentItemId: string): Promise<ContentItem | null> {
  await tx.$queryRaw`SELECT "id" FROM "content_items" WHERE "id" = ${contentItemId}::uuid AND "workspaceId" = ${workspaceId}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
  return tx.contentItem.findFirst({ where: { id: contentItemId, workspaceId, deletedAt: null } });
}

export async function validateStoredContentMedia(
  tx: Prisma.TransactionClient,
  content: Pick<ContentItem, "workspaceId" | "contentType" | "mediaIds">,
  options: { contentType?: ContentType; requireReady?: boolean; addition?: { id: string; mimeType: string } } = {}
): Promise<ContentMediaIssue | null> {
  const assets = await tx.mediaAsset.findMany({
    where: { id: { in: content.mediaIds }, workspaceId: content.workspaceId, deletedAt: null },
    select: { id: true, mimeType: true }
  });
  const ids = options.addition && !content.mediaIds.includes(options.addition.id) ? [...content.mediaIds, options.addition.id] : content.mediaIds;
  return contentMediaIssue(options.contentType ?? content.contentType, ids, options.addition ? [...assets, options.addition] : assets, options.requireReady);
}

export async function assertStoredContentMedia(
  tx: Prisma.TransactionClient,
  content: Pick<ContentItem, "workspaceId" | "contentType" | "mediaIds">,
  options: Parameters<typeof validateStoredContentMedia>[2] = {}
): Promise<void> {
  const issue = await validateStoredContentMedia(tx, content, options);
  if (issue) throw new ContentMediaValidationError(issue);
}
