import { type ContentRecord, type ContentMediaItemRecord } from "@markos/shared-types";
export { contentReadinessIssue as draftReadiness } from "@markos/shared-types";
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
