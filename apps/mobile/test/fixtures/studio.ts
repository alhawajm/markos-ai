import type { ContentRecord } from "@markos/shared-types";
export const fixture: ContentRecord = {
  id: "content",
  workspaceId: "workspace",
  contentType: "POST",
  status: "DRAFT",
  revision: 1,
  caption: "A real caption · نص عربي",
  reelScript: null,
  createdAt: "2026-09-24T10:00:00Z",
  updatedAt: "2026-09-24T10:00:00Z",
  mediaItems: [
    {
      id: "slot",
      workspaceId: "workspace",
      contentItemId: "content",
      position: 0,
      mediaKind: "IMAGE",
      mediaAssetId: null,
      purpose: null,
      title: null,
      body: null,
      visualDirection: "Pink event flowers",
      aspectRatio: "PORTRAIT",
      generationDurationSeconds: null,
      createdAt: "2026-09-24T10:00:00Z",
      updatedAt: "2026-09-24T10:00:00Z"
    }
  ]
};
