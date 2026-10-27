import { describe, expect, it, vi } from "vitest";
import type { CampaignRecord, ContentRecord, MediaAssetRecord } from "@markos/shared-types";
import { draftReadiness, generateMissingImages, mediaKind, saveDraftEdits } from "../src/studio/workflow";
import { draftOperations, preserveDraftEdits } from "../src/studio/model";
import { campaignRows } from "../src/campaigns/review-model";

import { fixture } from "./fixtures/studio";

const photo: MediaAssetRecord = {
  id: "photo",
  workspaceId: "workspace",
  type: "IMAGE",
  filename: "photo.jpg",
  publicUrl: "https://example.test/photo.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 1000,
  createdAt: fixture.createdAt,
  updatedAt: fixture.updatedAt
};

describe("mobile Create and campaign workflow", () => {
  it("keeps Post images, Reel videos and both Story media choices distinct", () => {
    expect(mediaKind(fixture, fixture.mediaItems[0]!)).toBe("IMAGE");
    expect(mediaKind({ ...fixture, contentType: "REEL" }, { ...fixture.mediaItems[0]!, mediaKind: "VIDEO" })).toBe("VIDEO");
    expect(mediaKind({ ...fixture, contentType: "STORY" }, { ...fixture.mediaItems[0]!, mediaKind: null })).toBeNull();
    for (const kind of ["IMAGE", "VIDEO"] as const)
      expect(mediaKind({ ...fixture, contentType: "STORY" }, { ...fixture.mediaItems[0]!, mediaKind: kind })).toBe(kind);
  });
  it("does not approve an Assistant text draft before media exists", () => {
    expect(draftReadiness({ ...fixture, caption: "" }, [])).toBe("caption");
    expect(draftReadiness(fixture, [])).toBe("media");
    const attached = { ...fixture, mediaItems: [{ ...fixture.mediaItems[0]!, mediaAssetId: "photo" }] };
    expect(draftReadiness(attached, undefined)).toBe("loading");
    expect(draftReadiness(attached, [])).toBe("incompatible");
    expect(draftReadiness(attached, [photo])).toBeNull();
    expect(draftReadiness({ ...attached, contentType: "STORY", caption: "" }, [photo])).toBeNull();
    expect(draftReadiness({ ...attached, contentType: "STORY", caption: "a".repeat(2201) }, [photo])).toBe("caption-invalid");
    expect(draftReadiness({ ...attached, contentType: "REEL" }, [photo])).toBe("incompatible");
  });
  it("requires an attachment on every carousel slide", () => {
    const carousel = { ...fixture, contentType: "CAROUSEL" as const };
    expect(draftReadiness(carousel, [photo])).toBe("carousel");
    expect(
      draftReadiness(
        {
          ...carousel,
          mediaItems: [
            { ...fixture.mediaItems[0]!, mediaAssetId: "photo" },
            { ...fixture.mediaItems[0]!, id: "two", position: 1 }
          ]
        },
        [photo]
      )
    ).toBe("media");
  });
  it("generates missing images sequentially with refreshed revisions and preserves existing attachments", async () => {
    let current: ContentRecord = {
      ...fixture,
      contentType: "CAROUSEL",
      mediaItems: [
        fixture.mediaItems[0]!,
        { ...fixture.mediaItems[0]!, id: "kept", position: 1, mediaAssetId: "keep" },
        { ...fixture.mediaItems[0]!, id: "last", position: 2 }
      ]
    };
    const generateContentImage = vi.fn(async (_id: string, input: { contentMediaItemId: string; expectedRevision: number }) => {
      expect(input.expectedRevision).toBe(current.revision);
      current = {
        ...current,
        revision: current.revision + 4,
        mediaItems: current.mediaItems.map((media) => (media.id === input.contentMediaItemId ? { ...media, mediaAssetId: `image-${media.id}` } : media))
      };
      return {} as Awaited<ReturnType<import("@markos/api-client").MarkosApiClient["generateContentImage"]>>;
    });
    const accept = vi.fn();
    const result = await generateMissingImages({ generateContentImage, contentItem: async () => current }, current, accept);
    expect(generateContentImage.mock.calls.map((call) => call[1].contentMediaItemId)).toEqual(["slot", "last"]);
    expect(result.mediaItems[1]!.mediaAssetId).toBe("keep");
    expect(accept).toHaveBeenCalledTimes(2);
  });
  it("stops on an ambiguous generation failure without retrying or starting later slides", async () => {
    const generateContentImage = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(
      generateMissingImages(
        { generateContentImage, contentItem: vi.fn() },
        { ...fixture, contentType: "CAROUSEL", mediaItems: [fixture.mediaItems[0]!, { ...fixture.mediaItems[0]!, id: "two" }] },
        vi.fn()
      )
    ).rejects.toThrow("timeout");
    expect(generateContentImage).toHaveBeenCalledOnce();
  });
  it("preserves script and planning edits without mutating the newer server record", () => {
    const base: ContentRecord = {
      ...fixture,
      contentType: "REEL",
      reelScript: {
        id: "script",
        workspaceId: "workspace",
        contentItemId: "content",
        hook: "Start",
        intendedDurationSeconds: 8,
        createdAt: fixture.createdAt,
        updatedAt: fixture.updatedAt,
        beats: [
          {
            id: "beat",
            workspaceId: "workspace",
            reelScriptId: "script",
            position: 0,
            text: "Original",
            createdAt: fixture.createdAt,
            updatedAt: fixture.updatedAt
          }
        ]
      }
    };
    const draft = {
      ...base,
      plannedAt: "2026-10-01T15:00:00Z",
      reelScript: { ...base.reelScript!, hook: "Exact hook", beats: [{ ...base.reelScript!.beats[0]!, text: "الوعي يبدأ بنا" }] }
    };
    const remote = { ...base, revision: 8 };
    const merged = preserveDraftEdits(base, draft, remote);
    expect(merged.reelScript!.beats[0]!.text).toBe("الوعي يبدأ بنا");
    expect(remote.reelScript!.beats[0]!.text).toBe("Original");
    expect(draftOperations(base, draft).map((operation) => operation.type)).toEqual(["updateContent", "updateReelScript", "updateReelBeat"]);
    expect(() => preserveDraftEdits(base, draft, { ...remote, reelScript: null })).toThrow("removed");
  });
  it("keeps campaign handoff IDs and dates stable across day/format filtering", () => {
    const post = { title: "Event", description: "Reference context", contentType: "STORY" as const, goal: "Awareness", contentPillar: "Trust" };
    const campaign = {
      startsAt: "2026-09-30T00:00:00Z",
      content: {
        weeklyCadence: [
          {
            week: 1,
            focus: "Launch",
            days: [
              { day: 1, posts: [post, post] },
              { day: 2, posts: [post] }
            ]
          },
          { week: 2, focus: "Event", days: [{ day: 8, posts: [post] }] }
        ]
      }
    } as CampaignRecord;
    const rows = campaignRows(campaign, [{ ...fixture, campaignWeek: 1, campaignActionIndex: 2, contentType: "REEL" }]);
    expect(rows.map((row) => row.key)).toEqual(["1:0", "1:1", "1:2", "2:0"]);
    expect(rows.find((row) => row.day === 2)).toMatchObject({ actionIndex: 2, date: "2026-10-01T00:00:00.000Z", type: "REEL", item: { id: "content" } });
  });
  it("preserves the remaining script edits if a later save batch fails", async () => {
    const base: ContentRecord = {
      ...fixture,
      contentType: "REEL",
      reelScript: {
        id: "script",
        workspaceId: "workspace",
        contentItemId: fixture.id,
        hook: "Hook",
        intendedDurationSeconds: 8,
        createdAt: fixture.createdAt,
        updatedAt: fixture.updatedAt,
        beats: Array.from({ length: 60 }, (_, index) => ({
          id: `beat-${index}`,
          workspaceId: "workspace",
          reelScriptId: "script",
          position: index,
          text: "Before",
          createdAt: fixture.createdAt,
          updatedAt: fixture.updatedAt
        }))
      }
    };
    const draft = { ...base, reelScript: { ...base.reelScript!, beats: base.reelScript!.beats.map((beat) => ({ ...beat, text: `Edited ${beat.id}` })) } };
    const saved = {
      ...base,
      revision: 2,
      reelScript: { ...base.reelScript!, beats: draft.reelScript.beats.map((beat, index) => (index < 50 ? beat : base.reelScript!.beats[index]!)) }
    };
    const mutateContent = vi.fn().mockResolvedValueOnce(saved).mockRejectedValueOnce(new Error("connection lost"));
    const progress = vi.fn();
    await expect(saveDraftEdits({ mutateContent }, base, draft, progress)).rejects.toThrow("connection lost");
    expect(mutateContent.mock.calls.map((call) => [call[1].expectedRevision, call[1].operations.length])).toEqual([
      [1, 50],
      [2, 10]
    ]);
    const [checkpoint, remaining] = progress.mock.calls[0]!;
    expect(draftOperations(checkpoint, remaining)).toHaveLength(10);
    expect(remaining.reelScript.beats[59].text).toBe("Edited beat-59");
  });
});
