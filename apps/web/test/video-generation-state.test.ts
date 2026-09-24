import { describe, expect, it } from "vitest";
import type { MediaGenerationJobRecord } from "@markos/shared-types";
import { runningVideoGeneration, videoGenerationMessage } from "../app/[locale]/_components/video-generation-state";

function job(overrides: Partial<MediaGenerationJobRecord>): MediaGenerationJobRecord {
  return {
    id: "job",
    workspaceId: "workspace",
    contentItemId: "content",
    contentMediaItemId: "media",
    requestedRevision: 1,
    kind: "VIDEO",
    status: "GENERATING",
    prompt: "Pink flowers",
    aspectRatio: "9:16",
    durationSeconds: 8,
    progress: 84,
    createdAt: "2026-09-21T00:00:00Z",
    updatedAt: "2026-09-21T00:00:00Z",
    ...overrides
  };
}

describe("video generation status", () => {
  it("shows actual progress while the current job is running", () => {
    expect(runningVideoGeneration(job({}))).toBe(true);
    expect(videoGenerationMessage(job({}), "en")).toContain("84%");
  });

  it.each(["moderation_blocked", "content_policy_violation", "AI_VIDEO_MODERATION_BLOCKED"])("explains %s instead of a generic failure", (errorCode) => {
    const failed = job({ status: "FAILED", errorCode, errorMessage: "Video generation failed" });
    expect(runningVideoGeneration(failed)).toBe(false);
    expect(videoGenerationMessage(failed, "en")).toContain("content policy");
    expect(videoGenerationMessage(failed, "ar")).toContain("سياسة المحتوى");
  });

  it("distinguishes an attached video from one retained in the Library", () => {
    expect(videoGenerationMessage(job({ status: "COMPLETED", attachmentApplied: true }), "en")).toBe("Video attached.");
    expect(videoGenerationMessage(job({ status: "COMPLETED", attachmentApplied: false }), "en")).toContain("Library");
  });
});
