import { captionValidationIssue, contentMediaIssue, type ContentRecord, type MediaAssetRecord, type ContentMediaItemRecord } from "@markos/shared-types";
import type { MarkosApiClient } from "@markos/api-client";
import { draftOperations, preserveDraftEdits } from "./model";

/** Long scripts can exceed the API's 50-operation limit. Retain unsaved edits after each acknowledged batch. */
export async function saveDraftEdits(
  api: Pick<MarkosApiClient, "mutateContent">,
  base: ContentRecord,
  draft: ContentRecord,
  progress: (base: ContentRecord, draft: ContentRecord) => void
): Promise<ContentRecord> {
  const operations = draftOperations(base, draft);
  let saved = base;
  for (let offset = 0; offset < operations.length; offset += 50) {
    saved = await api.mutateContent(base.id, { expectedRevision: saved.revision, operations: operations.slice(offset, offset + 50) });
    progress(saved, offset + 50 >= operations.length ? saved : preserveDraftEdits(base, draft, saved));
  }
  return saved;
}

export function mediaKind(item: ContentRecord, media: ContentMediaItemRecord): "IMAGE" | "VIDEO" | null {
  return item.contentType === "REEL" ? "VIDEO" : item.contentType === "STORY" ? media.mediaKind : "IMAGE";
}

/** Same format/caption checks as the API; the API revalidates on approval. */
export function draftReadiness(
  item: ContentRecord,
  assets: MediaAssetRecord[] | undefined
): "caption" | "caption-invalid" | "media" | "carousel" | "loading" | "incompatible" | null {
  if (item.contentType !== "STORY") {
    if (!item.caption.trim()) return "caption";
  }
  if (captionValidationIssue(item.caption)) return "caption-invalid";
  if (item.contentType === "CAROUSEL" && item.mediaItems.length < 2) return "carousel";
  if (!item.mediaItems.length || item.mediaItems.some((media) => !media.mediaAssetId)) return "media";
  if (!assets) return "loading";
  if (
    contentMediaIssue(
      item.contentType,
      item.mediaItems.map((media) => media.mediaAssetId!),
      assets,
      true
    )
  )
    return "incompatible";
  return item.mediaItems.some(
    (media) =>
      assets.find((asset) => asset.id === media.mediaAssetId)?.mimeType !==
      (media.mediaKind === "VIDEO" ? "video/mp4" : media.mediaKind === "IMAGE" ? "image/jpeg" : "")
  )
    ? "incompatible"
    : null;
}

/** Read a fresh revision after each attachment; never overwrite an existing asset or replay failed generation. */
export async function generateMissingImages(
  api: Pick<MarkosApiClient, "generateContentImage" | "contentItem">,
  initial: ContentRecord,
  accept: (item: ContentRecord) => void
): Promise<ContentRecord> {
  let current = initial;
  const targets = initial.mediaItems
    .filter((media) => mediaKind(initial, media) === "IMAGE" && !media.mediaAssetId && !!media.visualDirection?.trim())
    .map((media) => media.id);
  for (const id of targets) {
    const media = current.mediaItems.find((candidate) => candidate.id === id);
    if (!media || media.mediaAssetId || mediaKind(current, media) !== "IMAGE" || !["DRAFT", "IN_REVIEW"].includes(current.status)) continue;
    await api.generateContentImage(current.id, { contentMediaItemId: id, expectedRevision: current.revision });
    current = await api.contentItem(current.id);
    accept(current);
  }
  return current;
}
