import { describe, expect, it } from "vitest";
import type { ContentRecord } from "@markos/shared-types";
import { conversationActive, draftOperations, generationActive, preserveDraftEdits, scheduleInstant } from "../src/studio/model";
const item: ContentRecord = {
  id: "post",
  workspaceId: "workspace",
  platform: "INSTAGRAM",
  contentType: "REEL",
  status: "DRAFT",
  revision: 2,
  caption: "Original",
  brief: "Event",
  reelScript: null,
  createdAt: "2026-09-22T10:00:00Z",
  updatedAt: "2026-09-22T10:00:00Z",
  mediaItems: [
    {
      id: "slot",
      contentItemId: "post",
      workspaceId: "workspace",
      position: 0,
      mediaKind: "VIDEO",
      mediaAssetId: null,
      title: null,
      body: null,
      purpose: null,
      visualDirection: "Pink flowers",
      aspectRatio: "VERTICAL",
      generationDurationSeconds: 8,
      createdAt: "2026-09-22T10:00:00Z",
      updatedAt: "2026-09-22T10:00:00Z"
    }
  ]
};
describe("native studio recovery", () => {
  it("keeps exact English and Arabic edits while preserving a newly attached server video", () => {
    const draft = {
      ...item,
      caption: "Blooms in Pink · معًا من أجل الوعي",
      mediaItems: item.mediaItems.map((media) => ({ ...media, visualDirection: 'Flowers. Text: "معًا من أجل الوعي"' }))
    };
    const remote = { ...item, revision: 5, mediaItems: item.mediaItems.map((media) => ({ ...media, mediaAssetId: "generated-video" })) };
    const merged = preserveDraftEdits(item, draft, remote);
    expect(merged.caption).toBe(draft.caption);
    expect(merged.mediaItems[0]!.mediaAssetId).toBe("generated-video");
    expect(draftOperations(remote, merged)).toEqual([
      { type: "updateContent", fields: { caption: draft.caption } },
      { type: "updateMediaItem", itemId: "slot", fields: { visualDirection: draft.mediaItems[0]!.visualDirection } }
    ]);
  });
  it("does not silently lose edits to a removed slide", () => {
    const draft = { ...item, mediaItems: item.mediaItems.map((media) => ({ ...media, title: "Edited slide" })) };
    expect(() => preserveDraftEdits(item, draft, { ...item, mediaItems: [] })).toThrow("removed");
  });
  it("does not treat failed or cancelled jobs as still generating", () => {
    expect(generationActive("GENERATING")).toBe(true);
    expect(generationActive("FAILED")).toBe(false);
    expect(generationActive("CANCELLED")).toBe(false);
    expect(conversationActive("DISPATCHING")).toBe(true);
    expect(conversationActive("AWAITING_CONFIRMATION")).toBe(false);
  });
  it("schedules in Bahrain time across midnight and validates calendar dates", () => {
    expect(scheduleInstant("2026-10-04", "00:30")).toBe("2026-10-03T21:30:00.000Z");
    expect(scheduleInstant("2026-10-04", "18:00")).toBe("2026-10-04T15:00:00.000Z");
    expect(scheduleInstant("2026-02-30", "12:00")).toBeNull();
    expect(scheduleInstant("2026-10-04", "24:00")).toBeNull();
    expect(scheduleInstant("2026-10-04", "18:15")).toBeNull();
  });
});
