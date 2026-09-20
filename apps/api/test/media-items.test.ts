import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentRecord, ContentType } from "@markos/shared-types";
import { prisma } from "../src/db/prisma";
import { createContentAggregate, getContentAggregate, mutateContentAggregate, convertContentAggregate } from "../src/content/content-aggregate";
import { attachMediaToContent, detachMediaFromContent, generateImageForContent, updateContentMedia } from "../src/media/media-service";
import { updateContentItemStatus } from "../src/content/content-service";
import { queueVideoGeneration, processDueVideoGenerationJobs } from "../src/media/video-generation-service";
import { publishContentItem } from "../src/publishing/publishing-service";
import { persistTestInstagramConnection } from "./helpers/instagram-connection";
import { DryRunInstagramPublisher } from "../src/publishing/instagram-publisher";
import { instagramJpegFixture } from "./helpers/jpeg";
import { validateInstagramDatabaseTarget } from "./helpers/instagram-database";

const provider = vi.hoisted(() => ({ image: vi.fn(), start: vi.fn(), status: vi.fn(), download: vi.fn() }));
vi.mock("../src/ai/image-client", () => ({ generateImageAsset: provider.image }));
vi.mock("../src/ai/video-client", () => ({
  startVideoGeneration: provider.start,
  getVideoGenerationStatus: provider.status,
  downloadGeneratedVideo: provider.download
}));
vi.mock("../src/media/storage-service", () => ({
  deleteStoredMedia: vi.fn(),
  storeWorkspaceMedia: vi.fn(async (input: { workspaceId: string; filename: string; bytes: Buffer }) => ({
    key: `${input.workspaceId}/${randomUUID()}`,
    publicUrl: `https://example.com/${input.filename}`,
    sizeBytes: input.bytes.length
  }))
}));

const owner = randomUUID(),
  foreign = randomUUID();
const create = (contentType: ContentType = "POST", workspaceId = owner) =>
  prisma.$transaction((tx) =>
    createContentAggregate(tx, workspaceId, { platform: "INSTAGRAM", contentType, caption: contentType === "STORY" ? "" : "Caption" })
  );
const current = (c: ContentRecord) => getContentAggregate(c.workspaceId, c.id);
const request = (c: ContentRecord) => ({ contentMediaItemId: c.mediaItems[0]!.id, expectedRevision: c.revision });
const asset = (workspaceId = owner, mimeType = "image/jpeg", vertical = false) =>
  prisma.mediaAsset.create({
    data: {
      workspaceId,
      type: mimeType === "video/mp4" ? "VIDEO" : "IMAGE",
      filename: mimeType === "video/mp4" ? "video.mp4" : "image.jpg",
      s3Key: `external:${randomUUID()}`,
      cdnUrl: `https://example.com/${randomUUID()}`,
      mimeType,
      sizeBytes: 1000,
      width: 1080,
      height: vertical ? 1920 : 1080,
      durationSeconds: mimeType === "video/mp4" ? 8 : null
    }
  });
const attach = (c: ContentRecord, mediaAssetId: string) => attachMediaToContent(c.workspaceId, c.id, { ...request(c), mediaAssetId });
const ready = (c: ContentRecord) => updateContentItemStatus(c.workspaceId, c.id, { expectedRevision: c.revision, status: "APPROVED" });
const edit = (c: ContentRecord, fields: { visualDirection?: string; aspectRatio?: "SQUARE"; generationDurationSeconds?: number }) =>
  mutateContentAggregate(c.workspaceId, c.id, { expectedRevision: c.revision, operations: [{ type: "updateMediaItem", itemId: c.mediaItems[0]!.id, fields }] });
function imageResult(input: { aspectRatio: string }) {
  const [width, height] = input.aspectRatio === "1:1" ? [1024, 1024] : input.aspectRatio === "9:16" ? [1008, 1792] : [1024, 1280];
  const bytes = instagramJpegFixture(width!, height!);
  return {
    base64_data: bytes.toString("base64"),
    filename: "generated.jpg",
    mime_type: "image/jpeg",
    size_bytes: bytes.length,
    width,
    height,
    model: "test-image",
    prompt_version: "test",
    tokens_in: 1,
    tokens_out: 1
  };
}
beforeAll(async () => {
  if (!validateInstagramDatabaseTarget(process.env) || (!process.env.CI && new URL(process.env.DATABASE_URL!).pathname !== "/markos_local_test"))
    throw new Error("Use the designated disposable test database");
  for (const id of [owner, foreign])
    await prisma.workspace.create({
      data: {
        id,
        ownerUserId: randomUUID(),
        slug: `media-items-${id}`,
        name: "Media item tests",
        instagramAccountId: "fixture",
        instagramAccessToken: "fixture",
        instagramTokenExpiresAt: new Date(Date.now() + 86400000)
      }
    });
  await persistTestInstagramConnection({ workspaceId: owner, actorId: randomUUID() });
});
beforeEach(() => {
  vi.clearAllMocks();
  provider.image.mockImplementation(imageResult);
});
afterAll(async () => {
  await prisma.contentItem.deleteMany({ where: { workspaceId: { in: [owner, foreign] } } });
  await prisma.mediaAsset.deleteMany({ where: { workspaceId: { in: [owner, foreign] } } });
  await prisma.aiInteraction.deleteMany({ where: { workspaceId: { in: [owner, foreign] } } });
  await prisma.usageCounter.deleteMany({ where: { workspaceId: { in: [owner, foreign] } } });
  await prisma.workspace.deleteMany({ where: { id: { in: [owner, foreign] } } });
});

describe("item attachments", () => {
  it("replaces and detaches without changing logical identity or deleting Library files", async () => {
    const c = await create(),
      a = await asset(),
      b = await asset();
    const attached = await attach(c, a.id),
      replaced = await attach(attached, b.id);
    expect(replaced.mediaItems[0]).toMatchObject({ id: c.mediaItems[0]!.id, position: 0, mediaAssetId: b.id });
    const detached = await detachMediaFromContent(owner, c.id, c.mediaItems[0]!.id, replaced.revision);
    expect(detached.mediaItems[0]!.mediaAssetId).toBeNull();
    expect(await prisma.mediaAsset.count({ where: { id: { in: [a.id, b.id] }, deletedAt: null } })).toBe(2);
  });
  it("rejects foreign ownership, incompatible media, stale revisions and locked content", async () => {
    const c = await create(),
      other = await create(),
      a = await asset(),
      wrong = await asset(foreign),
      video = await asset(owner, "video/mp4");
    await expect(attach(c, wrong.id)).rejects.toThrow();
    await expect(attach(c, video.id)).rejects.toThrow();
    await expect(attachMediaToContent(owner, c.id, { ...request(c), contentMediaItemId: other.mediaItems[0]!.id, mediaAssetId: a.id })).rejects.toThrow();
    await expect(attachMediaToContent(foreign, c.id, { ...request(c), mediaAssetId: a.id })).rejects.toThrow();
    const attached = await attach(c, a.id);
    await expect(attach(c, a.id)).rejects.toThrow();
    const approved = await ready(attached);
    await expect(detachMediaFromContent(owner, c.id, c.mediaItems[0]!.id, approved.revision)).rejects.toThrow();
    await expect(generateImageForContent(owner, c.id, { ...request(approved), prompt: "Not editable" })).rejects.toThrow();
    expect(provider.image).not.toHaveBeenCalled();
  });
  it("serializes competing replacements and requires complete logical ID reorders", async () => {
    let c = await create("CAROUSEL");
    c = await mutateContentAggregate(owner, c.id, { expectedRevision: c.revision, operations: [{ type: "addMediaItem", fields: {} }] });
    const a = await asset(),
      b = await asset();
    const results = await Promise.allSettled([attach(c, a.id), attach(c, b.id)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    c = await current(c);
    const ids = c.mediaItems.map((item) => item.id).reverse();
    await expect(updateContentMedia(owner, c.id, { expectedRevision: c.revision, orderedIds: [a.id, b.id] })).rejects.toThrow();
    await expect(updateContentMedia(owner, c.id, { expectedRevision: c.revision, orderedIds: [ids[0]!, ids[0]!] })).rejects.toThrow();
    const reordered = await updateContentMedia(owner, c.id, { expectedRevision: c.revision, orderedIds: ids });
    expect(reordered.mediaItems.map((item) => item.id)).toEqual(ids);
    await expect(updateContentMedia(owner, c.id, { expectedRevision: c.revision, orderedIds: ids })).rejects.toThrow();
  });
});

describe("image generation intent", () => {
  it("uses saved slide direction/settings and replaces the selected slide even at capacity", async () => {
    let c = await create("CAROUSEL");
    c = await mutateContentAggregate(owner, c.id, {
      expectedRevision: c.revision,
      operations: Array.from({ length: 9 }, () => ({ type: "addMediaItem" as const, fields: {} }))
    });
    const selected = c.mediaItems[4]!;
    c = await mutateContentAggregate(owner, c.id, {
      expectedRevision: c.revision,
      operations: [
        {
          type: "updateMediaItem",
          itemId: selected.id,
          fields: { visualDirection: "Persisted slide direction", aspectRatio: "SQUARE", mediaAssetId: (await asset()).id }
        }
      ]
    });
    const result = await generateImageForContent(owner, c.id, { contentMediaItemId: selected.id, expectedRevision: c.revision });
    expect(provider.image).toHaveBeenCalledWith(expect.objectContaining({ prompt: "Persisted slide direction", aspectRatio: "1:1" }));
    expect(result.contentItem.mediaItems[4]).toMatchObject({ id: selected.id, position: 4, mediaAssetId: result.mediaAsset.id });
    expect(result.contentItem.mediaItems).toHaveLength(10);
  });
  it("retains the old attachment when the provider fails and stores an honest failed execution", async () => {
    const c = await attach(await create(), (await asset()).id);
    provider.image.mockRejectedValueOnce(new Error("Provider unavailable"));
    await expect(generateImageForContent(owner, c.id, { ...request(c), prompt: "Requested picture" })).rejects.toThrow("Provider unavailable");
    expect((await current(c)).mediaItems[0]!.mediaAssetId).toBe(c.mediaItems[0]!.mediaAssetId);
    expect(await prisma.mediaGenerationJob.findFirst({ where: { contentItemId: c.id } })).toMatchObject({ status: "FAILED", outputMediaAssetId: null });
  });
  it.each(["caption", "replacement", "direction", "settings", "remove", "convert", "supersede", "ready"])(
    "handles %s while synchronous generation is running",
    async (change) => {
      let c = await edit(await create(change === "remove" ? "CAROUSEL" : "POST"), { visualDirection: "Initial saved direction" });
      if (change === "remove")
        c = await mutateContentAggregate(owner, c.id, { expectedRevision: c.revision, operations: [{ type: "addMediaItem", fields: {} }] });
      if (change === "ready") c = await attach(c, (await asset()).id);
      let release!: () => void, started!: () => void;
      const barrier = new Promise<void>((resolve) => {
          release = resolve;
        }),
        entered = new Promise<void>((resolve) => {
          started = resolve;
        });
      provider.image.mockImplementationOnce(async (input) => {
        started();
        await barrier;
        return imageResult(input);
      });
      const pending = generateImageForContent(owner, c.id, request(c)).then(
        (value) => ({ value, error: null }),
        (error) => ({ value: null, error })
      );
      await entered;
      c = await current(c);
      const job = await prisma.mediaGenerationJob.findFirstOrThrow({ where: { contentItemId: c.id } });
      if (change === "caption")
        c = await mutateContentAggregate(owner, c.id, {
          expectedRevision: c.revision,
          operations: [{ type: "updateContent", fields: { caption: "New caption", tone: "Friendly", brief: "New brief" } }]
        });
      if (change === "replacement") c = await attach(c, (await asset()).id);
      if (change === "direction") c = await edit(c, { visualDirection: "New direction" });
      if (change === "settings") c = await edit(c, { aspectRatio: "SQUARE" });
      if (change === "remove")
        c = await mutateContentAggregate(owner, c.id, { expectedRevision: c.revision, operations: [{ type: "removeMediaItem", itemId: c.mediaItems[0]!.id }] });
      if (change === "convert")
        c = (await convertContentAggregate(owner, c.id, { expectedRevision: c.revision, contentType: "REEL", confirmDestructive: true })).content;
      if (change === "supersede") c = (await generateImageForContent(owner, c.id, { ...request(c), prompt: "Newer generation" })).contentItem;
      if (change === "ready") c = await ready(c);
      release();
      const result = await pending;
      const saved = await prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(saved).toMatchObject({ status: "COMPLETED", attachmentApplied: change === "caption", prompt: "Initial saved direction", aspectRatio: "4:5" });
      expect(await prisma.mediaAsset.findUnique({ where: { id: saved.outputMediaAssetId! } })).toMatchObject({ deletedAt: null });
      if (change === "caption") {
        expect(result.error).toBeNull();
        expect(result.value!.contentItem).toMatchObject({ caption: "New caption", tone: "Friendly", brief: "New brief" });
      } else {
        expect(result.error).toMatchObject({ code: "CONTENT_MEDIA_CHANGED", mediaAssetId: saved.outputMediaAssetId });
        expect(await current(c)).toEqual(c);
      }
    }
  );
});

describe("video execution snapshots", () => {
  it("keeps requested, script and actual durations separate; progress leaves revision untouched and caption edits do not suppress output", async () => {
    let c = await edit(await create("REEL"), { visualDirection: "Saved video direction", generationDurationSeconds: 4 });
    c = await mutateContentAggregate(owner, c.id, {
      expectedRevision: c.revision,
      operations: [{ type: "updateReelScript", fields: { hook: "Hook", intendedDurationSeconds: 45 } }]
    });
    const job = await queueVideoGeneration(owner, c.id, request(c));
    c = await current(c);
    provider.start.mockResolvedValue({
      provider_job_id: "fixture-video",
      status: "in_progress",
      progress: 20,
      model: "test-video",
      duration_seconds: 8,
      width: 720,
      height: 1280
    });
    await processDueVideoGenerationJobs({ limit: 1, now: new Date(Date.now() + 1000) });
    expect((await current(c)).revision).toBe(c.revision);
    expect(provider.start).toHaveBeenCalledWith(expect.objectContaining({ prompt: "Saved video direction", durationSeconds: 4 }));
    c = await mutateContentAggregate(owner, c.id, {
      expectedRevision: c.revision,
      operations: [{ type: "updateContent", fields: { caption: "New caption" } }]
    });
    provider.status.mockResolvedValue({
      provider_job_id: "fixture-video",
      status: "completed",
      progress: 100,
      model: "test-video",
      duration_seconds: 8,
      width: 720,
      height: 1280
    });
    provider.download.mockResolvedValue(Buffer.from("video"));
    await prisma.mediaGenerationJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    await processDueVideoGenerationJobs({ limit: 1 });
    const saved = await current(c),
      execution = await prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(saved.reelScript!.intendedDurationSeconds).toBe(45);
    expect(saved.mediaItems[0]).toMatchObject({ id: c.mediaItems[0]!.id, generationDurationSeconds: 4, mediaAssetId: execution.outputMediaAssetId });
    expect(saved.caption).toBe("New caption");
    expect(execution).toMatchObject({ durationSeconds: 4, attachmentApplied: true, status: "COMPLETED" });
    expect((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: execution.outputMediaAssetId! } })).durationSeconds).toBe(8);
    await expect(prisma.mediaGenerationJob.update({ where: { id: job.id }, data: { prompt: "Rewritten history" } })).rejects.toThrow();
  });
});

describe("relational readiness and publishing", () => {
  it.each(["POST", "CAROUSEL", "REEL"] as ContentType[])("still requires a caption for %s", async (contentType) => {
    let c = await attach(await create(contentType), (await asset(owner, contentType === "REEL" ? "video/mp4" : "image/jpeg")).id);
    if (contentType === "CAROUSEL")
      c = await mutateContentAggregate(owner, c.id, {
        expectedRevision: c.revision,
        operations: [{ type: "addMediaItem", fields: { mediaAssetId: (await asset()).id } }]
      });
    c = await mutateContentAggregate(owner, c.id, { expectedRevision: c.revision, operations: [{ type: "updateContent", fields: { caption: "" } }] });
    await expect(ready(c)).rejects.toMatchObject({ code: "CONTENT_CAPTION_REQUIRED" });
  });
  it.each(["POST", "CAROUSEL", "REEL", "STORY"] as ContentType[])("rejects incomplete %s", async (contentType) => {
    const c = await create(contentType);
    await expect(ready(c)).rejects.toThrow();
  });
  it.each(["POST", "CAROUSEL", "REEL", "STORY_IMAGE", "STORY_VIDEO"])("readies and publishes %s in item order", async (format) => {
    const type = format.startsWith("STORY") ? "STORY" : (format as ContentType);
    let c = await create(type);
    const a = await asset(owner, format === "REEL" || format === "STORY_VIDEO" ? "video/mp4" : "image/jpeg", type === "STORY" || type === "REEL");
    c = await attach(c, a.id);
    if (type === "CAROUSEL") {
      const b = await asset();
      c = await mutateContentAggregate(owner, c.id, { expectedRevision: c.revision, operations: [{ type: "addMediaItem", fields: { mediaAssetId: b.id } }] });
      c = await updateContentMedia(owner, c.id, { expectedRevision: c.revision, orderedIds: c.mediaItems.map((item) => item.id).reverse() });
    }
    c = await ready(c);
    await prisma.contentItem.update({ where: { id: c.id }, data: { status: "SCHEDULED", scheduledAt: new Date(Date.now() - 1000) } });
    const publisher = new DryRunInstagramPublisher(),
      spy = vi.spyOn(publisher, "publish");
    const result = await publishContentItem(owner, c.id, { publisher });
    expect(result.status).toBe("DRY_RUN");
    expect(spy.mock.calls[0]![0].mediaAssets.map((asset) => asset.id)).toEqual(c.mediaItems.map((item) => item.mediaAssetId));
    if (type === "STORY") expect(result.result!.payload.caption).toBe("");
  });
  it("does not silently skip an unfinished third Carousel slide", async () => {
    let c = await attach(await create("CAROUSEL"), (await asset()).id);
    c = await mutateContentAggregate(owner, c.id, {
      expectedRevision: c.revision,
      operations: [
        { type: "addMediaItem", fields: { mediaAssetId: (await asset()).id } },
        { type: "addMediaItem", fields: {} }
      ]
    });
    await expect(ready(c)).rejects.toThrow();
    await prisma.contentItem.update({ where: { id: c.id }, data: { status: "SCHEDULED", scheduledAt: new Date(Date.now() - 1000) } });
    const publisher = new DryRunInstagramPublisher(),
      spy = vi.spyOn(publisher, "publish");
    expect((await publishContentItem(owner, c.id, { publisher })).reasons).toContain("CONTENT_MEDIA_REQUIRED");
    expect(spy).not.toHaveBeenCalled();
  });
});
