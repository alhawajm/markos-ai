import type { ContentRecord, ContentMediaItemRecord } from "@markos/shared-types";
export function item(id = "item-1", contentItemId = "draft-1"): ContentMediaItemRecord {
  return {
    id,
    contentItemId,
    workspaceId: "workspace-1",
    position: 0,
    mediaKind: "IMAGE",
    mediaAssetId: null,
    purpose: null,
    title: null,
    body: null,
    visualDirection: null,
    aspectRatio: "SQUARE",
    generationDurationSeconds: null,
    createdAt: "2026-09-16T00:00:00Z",
    updatedAt: "2026-09-16T00:00:00Z"
  };
}
export function draft(overrides: Partial<ContentRecord> = {}): ContentRecord {
  return {
    id: "draft-1",
    workspaceId: "workspace-1",
    revision: 2,
    contentType: "POST",
    status: "DRAFT",
    caption: "",
    mediaItems: [item()],
    reelScript: null,
    createdAt: "2026-09-16T00:00:00Z",
    updatedAt: "2026-09-16T00:00:00Z",
    ...overrides
  };
}
