import { describe, expect, it } from "vitest";
import { contentJourney, contentReadinessIssue, prepareDraftInstruction, type MediaAssetRecord } from "@markos/shared-types";
import { draft, item } from "./create-fixtures";
const photo = {
  id: "photo",
  workspaceId: "workspace-1",
  type: "IMAGE",
  filename: "photo.jpg",
  mimeType: "image/jpeg",
  publicUrl: "https://example.test/photo.jpg",
  sizeBytes: 1000,
  createdAt: "2026-11-16T00:00:00Z",
  updatedAt: "2026-11-16T00:00:00Z"
} as MediaAssetRecord;
describe("state-based Create guidance", () => {
  it("explains a campaign handoff and keeps generation separate from approval and publishing", () => {
    const post = draft({ campaignId: "campaign", campaignWeek: 2, plannedAt: "2026-12-16T00:00:00+03:00", caption: "" });
    const guide = contentJourney(post, "en", contentReadinessIssue(post, []));
    expect(guide).toMatchObject({ stage: "START", action: "PREPARE" });
    expect(guide.title).toContain("campaign post");
    expect(guide.context).toContain("Week 2");
    expect(guide.context).toContain("Dec 16, 2026");
    expect(prepareDraftInstruction(post, "en")).toContain("leave it as a draft for my review");
    expect(contentJourney(post, "ar", "caption").title).toContain("حملتك");
  });
  it("asks for only the missing caption and preserves an attached design", () => {
    const post = draft({ caption: "", mediaItems: [{ ...item(), mediaAssetId: "photo" }] });
    expect(contentJourney(post, "en", contentReadinessIssue(post, [photo]))).toMatchObject({ stage: "INCOMPLETE", action: "CAPTION" });
    expect(prepareDraftInstruction(post, "en", true)).toContain("Keep the existing media and design unchanged");
  });
  it("requires actual valid attachments before offering review and does not infer Ready", () => {
    const post = draft({ caption: "A bakery launch", mediaItems: [{ ...item(), mediaAssetId: "photo" }] });
    expect(contentReadinessIssue(post, [])).toBe("incompatible");
    expect(contentReadinessIssue(post, [photo])).toBeNull();
    expect(contentJourney(post, "en", null)).toMatchObject({ stage: "REVIEW", action: "REVIEW" });
    expect(contentJourney({ ...post, status: "APPROVED" }, "en", null)).toMatchObject({ stage: "READY", action: "PUBLISH" });
    expect(contentReadinessIssue({ ...post, contentType: "STORY", caption: "" }, [photo])).toBeNull();
  });
  it("reports generation and publication progress without claiming success", () => {
    const post = draft({ caption: "A bakery launch" });
    expect(contentJourney(post, "en", "media", { working: true })).toMatchObject({ stage: "WORKING", action: "WAIT" });
    expect(contentJourney({ ...post, status: "APPROVED" }, "en", null, { publishing: true })).toMatchObject({ stage: "PUBLISHING", action: "WAIT" });
    expect(contentJourney({ ...post, status: "APPROVED" }, "en", null, { publishingFailed: true })).toMatchObject({ stage: "FAILED", action: "RECOVERY" });
  });
  it("follows saved scheduling and confirmed publication rather than a missing-caption fallback", () => {
    expect(contentJourney(draft({ status: "SCHEDULED" }), "en", "caption")).toMatchObject({ stage: "SCHEDULED", action: "CALENDAR" });
    expect(contentJourney(draft({ status: "PUBLISHED" }), "ar", "media")).toMatchObject({ stage: "PUBLISHED", action: "INSIGHTS" });
  });
});
