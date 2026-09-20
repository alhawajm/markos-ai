import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ContentRecord, ContentType } from "@markos/shared-types";
import { contentMutationSchema, convertContentSchema, createContentSchema, updateContentSchema, type ContentMutationInput } from "@markos/validation";
import { prisma } from "../src/db/prisma";
import {
  createContentAggregate,
  getContentAggregate,
  mutateContentAggregate,
  convertContentAggregate,
  lockContentRoot
} from "../src/content/content-aggregate";
import { approveCampaignSuggestion } from "../src/campaign/campaign-service";
import { registerContentRoutes } from "../src/content/content-routes";
import { deleteContentItem, generateWorkspaceContent } from "../src/content/content-service";
import { runWorkspaceContextScope, setWorkspaceContext } from "../src/tenancy/workspace-context";
import { validateInstagramDatabaseTarget } from "./helpers/instagram-database";

vi.mock("../src/vault/vault-service", async (original) => ({
  ...(await original<typeof import("../src/vault/vault-service")>()),
  getVaultScore: async () => ({ entryCount: 1 }),
  searchVaultContext: async () => []
}));
vi.mock("../src/ai/content-client", () => ({
  generateContentDrafts: async (input: { contentType: ContentType }) => ({
    model: "test",
    prompt_version: "test",
    tokens_in: 1,
    tokens_out: 1,
    drafts: [
      {
        contentType: input.contentType,
        caption: "Generated caption",
        visualDirection: "Warm light",
        contentPillar: "Proof",
        ...(input.contentType === "CAROUSEL"
          ? {
              carousel: {
                slides: [
                  { title: "One", body: "Opening" },
                  { title: "Two", body: "Benefits" }
                ]
              }
            }
          : {}),
        ...(input.contentType === "REEL" ? { reelScript: { hook: "Hook", durationSeconds: 45, beats: ["First", "Last"] } } : {})
      }
    ]
  })
}));

const workspaceId = randomUUID();
const otherWorkspaceId = randomUUID();
type Operation = ContentMutationInput["operations"][number];
const create = (contentType: ContentType = "POST", owner = workspaceId) =>
  prisma.$transaction((tx) => createContentAggregate(tx, owner, { platform: "INSTAGRAM", contentType }));
const mutate = (record: ContentRecord, ...operations: Operation[]) =>
  mutateContentAggregate(record.workspaceId, record.id, { expectedRevision: record.revision, operations });
const convert = (record: ContentRecord, contentType: ContentType, extra: { confirmDestructive?: boolean; retainMediaItemId?: string } = {}) =>
  convertContentAggregate(record.workspaceId, record.id, { expectedRevision: record.revision, contentType, confirmDestructive: false, ...extra });
const asset = (owner = workspaceId, mimeType = "image/jpeg") =>
  prisma.mediaAsset.create({
    data: {
      workspaceId: owner,
      type: mimeType === "video/mp4" ? "VIDEO" : "IMAGE",
      filename: "test",
      s3Key: randomUUID(),
      cdnUrl: "https://example.test/media",
      mimeType,
      sizeBytes: 100,
      width: 1080,
      height: 1920
    }
  });

beforeAll(async () => {
  if (!validateInstagramDatabaseTarget(process.env)) throw new Error("Aggregate tests require an explicit disposable loopback database");
  if (!process.env.CI && new URL(process.env.DATABASE_URL!).pathname !== "/markos_local_test")
    throw new Error("Use the workstation's designated test database");
  for (const id of [workspaceId, otherWorkspaceId])
    await prisma.workspace.create({ data: { id, ownerUserId: randomUUID(), name: "Aggregate test", slug: `aggregate-${id}` } });
});
afterAll(async () => {
  await prisma.contentItem.deleteMany({ where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } });
  await prisma.campaign.deleteMany({ where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } });
  await prisma.mediaAsset.deleteMany({ where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } });
  await prisma.aiInteraction.deleteMany({ where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } });
  await prisma.usageCounter.deleteMany({ where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } });
  await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
  await prisma.$disconnect();
});

describe("relational authoring validation", () => {
  it("rejects legacy root fields, scalar conversion and missing revisions", () => {
    for (const key of ["mediaIds", "visualDirection", "carousel", "reelScript"]) {
      expect(createContentSchema.safeParse({ [key]: null }).success).toBe(false);
      expect(updateContentSchema.safeParse({ expectedRevision: 1, [key]: null }).success).toBe(false);
    }
    expect(updateContentSchema.safeParse({ contentType: "REEL", expectedRevision: 1 }).success).toBe(false);
    expect(updateContentSchema.safeParse({ caption: "Unsafely unversioned" }).success).toBe(false);
    expect(updateContentSchema.safeParse({ expectedRevision: 1 }).success).toBe(false);
    expect(contentMutationSchema.safeParse({ operations: [] }).success).toBe(false);
    expect(convertContentSchema.safeParse({ contentType: "STORY" }).success).toBe(false);
  });
  it("requires unique logical IDs, forbids position edits and validates settings", () => {
    const id = randomUUID();
    for (const operation of [
      { type: "reorderMediaItems", orderedIds: [id, id] },
      { type: "updateMediaItem", itemId: id, fields: { position: 2 } },
      { type: "updateMediaItem", itemId: id, fields: { generationDurationSeconds: -1 } },
      { type: "updateMediaItem", itemId: id, fields: { aspectRatio: "invented" } },
      { type: "updateMediaItem", itemId: id, fields: {} },
      { type: "updateReelBeat", position: 0, text: "No stable ID" }
    ])
      expect(contentMutationSchema.safeParse({ expectedRevision: 1, operations: [operation] }).success).toBe(false);
  });
});

describe("content aggregate", () => {
  it.each(["POST", "CAROUSEL", "REEL", "STORY"] as const)("creates an empty %s creative slot with the correct kind", async (type) => {
    const record = await create(type);
    expect(record.mediaItems).toHaveLength(1);
    expect(record.mediaItems[0]).toMatchObject({
      contentItemId: record.id,
      workspaceId,
      position: 0,
      mediaAssetId: null,
      mediaKind: type === "REEL" ? "VIDEO" : type === "STORY" ? null : "IMAGE"
    });
    expect(record.reelScript).toBeNull();
    expect(record.revision).toBeGreaterThan(1);
    expect(await getContentAggregate(workspaceId, record.id)).toEqual(record);
    expect(record).not.toHaveProperty("mediaIds");
    expect(record).not.toHaveProperty("visualDirection");
  });

  it("saves shared fields and item settings atomically and preserves identity on asset replacement", async () => {
    const record = await create();
    const itemId = record.mediaItems[0]!.id;
    const first = await asset();
    const second = await asset();
    const changed = await mutate(
      record,
      { type: "updateContent", fields: { caption: "  English\n\nالعربية #Bahrain  ", campaignGoal: "Awareness", brief: "Owner brief" } },
      { type: "updateMediaItem", itemId, fields: { mediaAssetId: first.id, title: "Opening", visualDirection: "Warm light", aspectRatio: "SQUARE" } }
    );
    expect(changed.caption).toBe("  English\n\nالعربية #Bahrain  ");
    expect(changed.revision).toBeGreaterThan(record.revision);
    const replaced = await mutate(changed, { type: "updateMediaItem", itemId, fields: { mediaAssetId: second.id } });
    expect(replaced.mediaItems[0]).toMatchObject({ id: itemId, mediaAssetId: second.id, visualDirection: "Warm light" });
    expect(await prisma.mediaAsset.count({ where: { id: { in: [first.id, second.id] }, deletedAt: null } })).toBe(2);
  });

  it("adds, reorders and removes empty logical slides without needing assets", async () => {
    let record = await create("CAROUSEL");
    const firstId = record.mediaItems[0]!.id;
    record = await mutate(record, { type: "addMediaItem", fields: { title: "Second", purpose: "Benefits" } });
    const secondId = record.mediaItems[1]!.id;
    record = await mutate(record, { type: "addMediaItem", afterId: firstId, fields: { body: "Between" } });
    const middleId = record.mediaItems[1]!.id;
    record = await mutate(record, { type: "reorderMediaItems", orderedIds: [secondId, middleId, firstId] });
    expect(record.mediaItems.map((item) => [item.id, item.position])).toEqual([
      [secondId, 0],
      [middleId, 1],
      [firstId, 2]
    ]);
    await expect(mutate(record, { type: "reorderMediaItems", orderedIds: [firstId] })).rejects.toMatchObject({ code: "CONTENT_ORDER_INVALID" });
    record = await mutate(record, { type: "removeMediaItem", itemId: middleId });
    expect(record.mediaItems.map((item) => item.id)).toEqual([secondId, firstId]);
    expect((await prisma.contentMediaItem.findUniqueOrThrow({ where: { id: middleId } })).deletedAt).not.toBeNull();
    expect((await getContentAggregate(workspaceId, record.id)).revision).toBe(record.revision);
  });

  it("keeps the Reel script on content and preserves beat IDs and distinct durations", async () => {
    let record = await create("REEL");
    const itemId = record.mediaItems[0]!.id;
    record = await mutate(
      record,
      { type: "updateReelScript", fields: { hook: "Start here", intendedDurationSeconds: 45 } },
      { type: "addReelBeat", text: "Opening" },
      { type: "addReelBeat", text: "Finish" },
      { type: "updateMediaItem", itemId, fields: { generationDurationSeconds: 8, aspectRatio: "VERTICAL" } }
    );
    const script = record.reelScript!;
    const [first, second] = script.beats;
    expect(script.contentItemId).toBe(record.id);
    expect(script).not.toHaveProperty("contentMediaItemId");
    record = await mutate(
      record,
      { type: "reorderReelBeats", orderedIds: [second!.id, first!.id] },
      { type: "updateReelBeat", beatId: first!.id, text: "New opening" }
    );
    expect(record.reelScript!.beats.map((beat) => beat.id)).toEqual([second!.id, first!.id]);
    const video = await asset(workspaceId, "video/mp4");
    record = await mutate(record, { type: "updateMediaItem", itemId, fields: { mediaAssetId: video.id } }, { type: "removeReelBeat", beatId: second!.id });
    expect(record.reelScript).toMatchObject({ id: script.id, intendedDurationSeconds: 45, beats: [{ id: first!.id, position: 0, text: "New opening" }] });
    expect(record.mediaItems[0]!.generationDurationSeconds).toBe(8);
    const before = record.revision;
    await prisma.contentReelBeat.update({ where: { id: first!.id }, data: { text: "Direct child write" } });
    expect((await getContentAggregate(workspaceId, record.id)).revision).toBeGreaterThan(before);
  });

  it("rolls back shared and child changes together and rejects stale/concurrent writes", async () => {
    const record = await create();
    await expect(
      mutate(
        record,
        { type: "updateContent", fields: { caption: "Must roll back" } },
        { type: "updateMediaItem", itemId: randomUUID(), fields: { title: "Wrong ID" } }
      )
    ).rejects.toMatchObject({ code: "CONTENT_TARGET_NOT_FOUND" });
    expect(await getContentAggregate(workspaceId, record.id)).toEqual(record);
    const results = await Promise.allSettled([
      mutate(record, { type: "updateContent", fields: { caption: "Writer one" } }),
      mutate(record, { type: "updateMediaItem", itemId: record.mediaItems[0]!.id, fields: { title: "Writer two" } })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "CONTENT_REVISION_CONFLICT" } });
  });

  it("enforces format count, media compatibility and attachment ownership", async () => {
    const record = await create();
    const itemId = record.mediaItems[0]!.id;
    await expect(mutate(record, { type: "addMediaItem", fields: {} })).rejects.toMatchObject({ code: "CONTENT_ITEM_LIMIT" });
    const foreign = await asset(otherWorkspaceId);
    const video = await asset(workspaceId, "video/mp4");
    await expect(mutate(record, { type: "updateMediaItem", itemId, fields: { mediaAssetId: foreign.id } })).rejects.toThrow();
    await expect(mutate(record, { type: "updateMediaItem", itemId, fields: { mediaAssetId: video.id } })).rejects.toMatchObject({
      code: "CONTENT_MEDIA_INCOMPATIBLE"
    });
    await expect(mutate(record, { type: "updateReelScript", fields: { hook: "Wrong format" } })).rejects.toMatchObject({ code: "CONTENT_STRUCTURE_INVALID" });
    expect(await getContentAggregate(workspaceId, record.id)).toEqual(record);
    let carousel = await create("CAROUSEL");
    carousel = await mutate(carousel, ...Array.from({ length: 9 }, () => ({ type: "addMediaItem" as const, fields: {} })));
    await expect(mutate(carousel, { type: "addMediaItem", fields: {} })).rejects.toMatchObject({ code: "CONTENT_ITEM_LIMIT" });
  });

  it("protects cross-workspace root, item, beat and asset references", async () => {
    const own = await create("REEL");
    let other = await create("REEL", otherWorkspaceId);
    other = await mutate(other, { type: "addReelBeat", text: "Private" });
    await expect(getContentAggregate(workspaceId, other.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(mutate(own, { type: "updateMediaItem", itemId: other.mediaItems[0]!.id, fields: { title: "Leak" } })).rejects.toMatchObject({
      statusCode: 404
    });
    await expect(mutate(own, { type: "updateReelBeat", beatId: other.reelScript!.beats[0]!.id, text: "Leak" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(prisma.contentReelScript.create({ data: { workspaceId, contentItemId: other.id } })).rejects.toThrow();
    await expect(prisma.contentReelBeat.create({ data: { workspaceId, reelScriptId: other.reelScript!.id, position: 1, text: "Leak" } })).rejects.toThrow();
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE markos_app");
      await tx.$queryRaw`SELECT set_config('app.current_workspace', ${workspaceId}, true)`;
      expect(await tx.contentMediaItem.findMany({ where: { contentItemId: other.id } })).toEqual([]);
      expect(await tx.contentReelScript.findMany({ where: { id: other.reelScript!.id } })).toEqual([]);
      expect(await tx.contentReelBeat.findMany({ where: { reelScriptId: other.reelScript!.id } })).toEqual([]);
      expect(await tx.contentMediaItem.count({ where: { contentItemId: own.id } })).toBe(1);
      const before = await tx.contentItem.findUniqueOrThrow({ where: { id: own.id } });
      await tx.contentMediaItem.update({ where: { id: own.mediaItems[0]!.id }, data: { title: "RLS write" } });
      expect((await tx.contentItem.findUniqueOrThrow({ where: { id: own.id } })).revision).toBeGreaterThan(before.revision);
    });
  });

  it("enforces database structure constraints even outside services", async () => {
    const record = await create();
    const itemId = record.mediaItems[0]!.id;
    await expect(prisma.contentMediaItem.update({ where: { id: itemId }, data: { position: -1 } })).rejects.toThrow();
    await expect(prisma.contentMediaItem.update({ where: { id: itemId }, data: { position: 3 } })).rejects.toThrow();
    await expect(prisma.contentMediaItem.update({ where: { id: itemId }, data: { mediaKind: null, generationDurationSeconds: 8 } })).rejects.toThrow();
    await expect(prisma.contentMediaItem.delete({ where: { id: itemId } })).rejects.toThrow();
    await expect(prisma.contentReelScript.create({ data: { workspaceId, contentItemId: record.id } })).rejects.toThrow();
    const other = await create();
    await expect(prisma.contentMediaItem.update({ where: { id: itemId }, data: { contentItemId: other.id } })).rejects.toThrow();
    expect(await getContentAggregate(workspaceId, record.id)).toEqual(record);
  });
  it("rejects duplicate attachments and protects active assets from soft deletion", async () => {
    let record = await create("CAROUSEL");
    const image = await asset();
    record = await mutate(record, { type: "updateMediaItem", itemId: record.mediaItems[0]!.id, fields: { mediaAssetId: image.id } });
    await expect(mutate(record, { type: "addMediaItem", fields: { mediaAssetId: image.id } })).rejects.toThrow();
    expect(await getContentAggregate(workspaceId, record.id)).toEqual(record);
    await expect(prisma.mediaAsset.update({ where: { id: image.id }, data: { deletedAt: new Date() } })).rejects.toThrow();
    await expect(prisma.mediaAsset.update({ where: { id: image.id }, data: { mimeType: "video/mp4" } })).rejects.toThrow();
  });
  it("serializes an attachment against concurrent asset soft deletion", async () => {
    const record = await create();
    const image = await asset();
    let announce!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      announce = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const attachment = prisma.$transaction(async (tx) => {
      await lockContentRoot(tx, workspaceId, record.id, record.revision);
      await tx.contentMediaItem.update({ where: { id: record.mediaItems[0]!.id }, data: { mediaAssetId: image.id } });
      announce();
      await hold;
    });
    await entered;
    const deletion = prisma.mediaAsset.update({ where: { id: image.id }, data: { deletedAt: new Date() } }).then(
      () => "deleted",
      () => "rejected"
    );
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
    } finally {
      release();
    }
    await attachment;
    expect(await deletion).toBe("rejected");
    expect((await getContentAggregate(workspaceId, record.id)).mediaItems[0]!.mediaAssetId).toBe(image.id);
    expect((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: image.id } })).deletedAt).toBeNull();
  });
});

describe("explicit format conversion", () => {
  it("converts empty formats without confirmation and retains logical identity", async () => {
    let record = await create();
    const id = record.mediaItems[0]!.id;
    for (const type of ["CAROUSEL", "REEL", "STORY", "POST"] as const) {
      const result = await convert(record, type);
      expect(result).toMatchObject({ applied: true, preview: { requiresConfirmation: false } });
      expect(result.content.mediaItems[0]!.id).toBe(id);
      record = result.content;
    }
  });
  it("requires a retained selection and confirmation before discarding populated slides", async () => {
    let record = await create("CAROUSEL");
    const firstId = record.mediaItems[0]!.id;
    record = await mutate(
      record,
      { type: "updateMediaItem", itemId: firstId, fields: { title: "First" } },
      { type: "addMediaItem", fields: { title: "Second" } }
    );
    const secondId = record.mediaItems[1]!.id;
    expect(await convert(record, "POST", { confirmDestructive: true })).toMatchObject({ applied: false, preview: { requiresSelection: true } });
    const preview = await convert(record, "POST", { retainMediaItemId: secondId });
    expect(preview).toMatchObject({ applied: false, preview: { removedItemIds: [firstId], requiresConfirmation: true } });
    expect(await getContentAggregate(workspaceId, record.id)).toEqual(record);
    const result = await convert(record, "POST", { retainMediaItemId: secondId, confirmDestructive: true });
    expect(result.content.mediaItems).toMatchObject([{ id: secondId, position: 0, title: "Second" }]);
  });
  it("clears incompatible Reel script/settings but never deletes library files", async () => {
    let record = await create("REEL");
    const video = await asset(workspaceId, "video/mp4");
    record = await mutate(
      record,
      { type: "updateReelScript", fields: { hook: "Hook", intendedDurationSeconds: 45 } },
      { type: "addReelBeat", text: "Opening" },
      { type: "updateMediaItem", itemId: record.mediaItems[0]!.id, fields: { mediaAssetId: video.id, generationDurationSeconds: 8, aspectRatio: "VERTICAL" } }
    );
    const preview = await convert(record, "POST");
    expect(preview).toMatchObject({ applied: false, preview: { detachedAssetIds: [video.id] } });
    expect(preview.preview.resetFields).toContain("reelScript");
    const result = await convert(record, "POST", { confirmDestructive: true });
    expect(result.content.reelScript).toBeNull();
    expect(result.content.mediaItems[0]).toMatchObject({
      id: record.mediaItems[0]!.id,
      mediaKind: "IMAGE",
      mediaAssetId: null,
      generationDurationSeconds: null,
      aspectRatio: null
    });
    expect(await prisma.contentReelBeat.count({ where: { reelScriptId: record.reelScript!.id } })).toBe(0);
    expect((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: video.id } })).deletedAt).toBeNull();
    await expect(convert(record, "STORY", { confirmDestructive: true })).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
  });
  it("retains compatible video when converting a Reel to Story", async () => {
    let record = await create("REEL");
    const video = await asset(workspaceId, "video/mp4");
    record = await mutate(record, { type: "updateMediaItem", itemId: record.mediaItems[0]!.id, fields: { mediaAssetId: video.id } });
    const result = await convert(record, "STORY");
    expect(result).toMatchObject({ applied: true, content: { contentType: "STORY", mediaItems: [{ mediaAssetId: video.id, mediaKind: "VIDEO" }] } });
  });
});

describe("campaign draft writer", () => {
  it("creates a valid aggregate and repeated approval preserves owner edits", async () => {
    const campaign = await prisma.campaign.create({
      data: {
        workspaceId,
        title: "Campaign",
        startsAt: new Date("2026-10-01"),
        endsAt: new Date("2026-10-04"),
        durationDays: 3,
        content: {
          weeklyCadence: [
            { week: 1, days: [{ day: 1, posts: [{ title: "Idea", description: "Brief", contentType: "REEL", goal: "Awareness", contentPillar: "Proof" }] }] }
          ]
        }
      }
    });
    const record = await approveCampaignSuggestion(workspaceId, campaign.id, { week: 1, actionIndex: 0 });
    expect(record.mediaItems).toMatchObject([{ mediaKind: "VIDEO", mediaAssetId: null }]);
    expect(record.campaignId).toBe(campaign.id);
    const edited = await mutate(record, { type: "updateContent", fields: { caption: "Keep owner text" } });
    expect(await approveCampaignSuggestion(workspaceId, campaign.id, { week: 1, actionIndex: 0 })).toEqual(edited);
  });
  it.each(["POST", "CAROUSEL", "REEL", "STORY"] as const)("materializes generated %s drafts into relational rows", async (contentType) => {
    const records = await generateWorkspaceContent(workspaceId, { topic: "A new campaign", contentType, count: 1 });
    const record = records[0]!;
    expect(record.mediaItems[0]!.visualDirection).toBe("Warm light");
    expect(record.caption).toBe("Generated caption");
    expect(await getContentAggregate(workspaceId, record.id)).toEqual(record);
    if (contentType === "CAROUSEL") expect(record.mediaItems.map((item) => item.title)).toEqual(["One", "Two"]);
    if (contentType === "REEL")
      expect(record.reelScript).toMatchObject({ hook: "Hook", intendedDurationSeconds: 45, beats: [{ text: "First" }, { text: "Last" }] });
  });
});

describe("authoring HTTP contract", () => {
  it("exposes create/read/patch/mutate/convert with mandatory revisions", async () => {
    const app = Fastify();
    // Authentication/permissions are covered by the existing app suites. This
    // fixture supplies a workspace context to exercise the actual route wiring.
    app.addHook("onRequest", (_request, _reply, done) =>
      runWorkspaceContextScope(() => {
        setWorkspaceContext({ workspaceId, userId: randomUUID(), roles: ["OWNER"], isVerified: true, mfaVerified: false, mfaVerifiedUntil: null });
        done();
      })
    );
    await registerContentRoutes(app);
    try {
      const created = await app.inject({ method: "POST", url: "/v1/content", payload: { contentType: "POST", caption: "Owner text" } });
      expect(created.statusCode).toBe(200);
      const record = created.json().data as ContentRecord;
      expect(record.mediaItems).toHaveLength(1);
      expect((await app.inject({ method: "GET", url: `/v1/content/${record.id}` })).json().data).toEqual(record);
      expect((await app.inject({ method: "PATCH", url: `/v1/content/${record.id}`, payload: { caption: "No revision" } })).statusCode).toBe(400);
      const patched = await app.inject({ method: "PATCH", url: `/v1/content/${record.id}`, payload: { expectedRevision: record.revision, caption: "Saved" } });
      expect(patched.statusCode).toBe(200);
      const saved = patched.json().data as ContentRecord;
      const stale = await app.inject({
        method: "POST",
        url: `/v1/content/${record.id}/mutate`,
        payload: { expectedRevision: record.revision, operations: [{ type: "updateContent", fields: { caption: "Stale" } }] }
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().error.code).toBe("CONTENT_REVISION_CONFLICT");
      const converted = await app.inject({
        method: "POST",
        url: `/v1/content/${record.id}/convert`,
        payload: { expectedRevision: saved.revision, contentType: "CAROUSEL" }
      });
      expect(converted.statusCode).toBe(200);
      const changed = converted.json().data.content as ContentRecord;
      const added = await app.inject({
        method: "POST",
        url: `/v1/content/${record.id}/mutate`,
        payload: { expectedRevision: changed.revision, operations: [{ type: "addMediaItem", fields: { title: "Second" } }] }
      });
      expect(added.statusCode).toBe(200);
      expect(added.json().data.mediaItems).toHaveLength(2);
      expect((await app.inject({ method: "DELETE", url: `/v1/content/${record.id}`, payload: {} })).statusCode).toBe(400);
      expect(
        (await app.inject({ method: "DELETE", url: `/v1/content/${record.id}`, payload: { expectedRevision: added.json().data.revision } })).statusCode
      ).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe("aggregate deletion retention", () => {
  it("keeps reusable assets on soft deletion and cascades owned rows on physical deletion", async () => {
    const media = await asset(workspaceId, "video/mp4");
    let content = await create("REEL");
    content = await mutate(
      content,
      { type: "updateMediaItem", itemId: content.mediaItems[0]!.id, fields: { mediaAssetId: media.id } },
      { type: "updateReelScript", fields: { hook: "Hook", intendedDurationSeconds: 30 } },
      { type: "addReelBeat", text: "Opening beat" }
    );
    const item = await prisma.contentMediaItem.findUniqueOrThrow({ where: { id: content.mediaItems[0]!.id } });
    const job = await prisma.mediaGenerationJob.create({
      data: {
        workspaceId,
        contentItemId: content.id,
        contentMediaItemId: item.id,
        generationIntent: item.generationIntent,
        requestedRevision: content.revision,
        prompt: "Direction",
        status: "COMPLETED",
        outputMediaAssetId: media.id
      }
    });
    const conversation = await prisma.contentConversation.create({
      data: {
        workspaceId,
        contentItemId: content.id,
        runs: {
          create: {
            workspaceId,
            userId: randomUUID(),
            requestId: randomUUID(),
            instruction: "Edit",
            baseRevision: content.revision,
            actionState: { applied: true }
          }
        }
      }
    });
    await expect(deleteContentItem(workspaceId, content.id, content.revision - 1)).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
    await deleteContentItem(workspaceId, content.id, content.revision);
    await expect(getContentAggregate(workspaceId, content.id)).rejects.toMatchObject({ code: "CONTENT_NOT_FOUND" });
    expect((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: media.id } })).deletedAt).toBeNull();
    expect(await prisma.mediaGenerationJob.findUnique({ where: { id: job.id } })).not.toBeNull();
    await prisma.contentItem.delete({ where: { id: content.id } });
    expect(await prisma.contentMediaItem.count({ where: { contentItemId: content.id } })).toBe(0);
    expect(await prisma.contentReelScript.count({ where: { contentItemId: content.id } })).toBe(0);
    expect(await prisma.contentReelBeat.count({ where: { reelScriptId: content.reelScript!.id } })).toBe(0);
    expect(await prisma.mediaGenerationJob.findUnique({ where: { id: job.id } })).toBeNull();
    expect(await prisma.conversationRun.count({ where: { conversationId: conversation.id } })).toBe(0);
    expect(await prisma.mediaAsset.findUnique({ where: { id: media.id } })).not.toBeNull();
  });
});
