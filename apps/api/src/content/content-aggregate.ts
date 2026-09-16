import { randomUUID } from "node:crypto";
import { Prisma, type ContentType } from "@prisma/client";
import type { ContentRecord } from "@markos/shared-types";
import {
  contentMutationSchema,
  convertContentSchema,
  createContentSchema,
  type ContentMutationInput,
  type ConvertContentInput,
  type CreateContentInput
} from "@markos/validation";
import { prisma } from "../db/prisma";
import { ContentConflictError } from "./content-conflict";

export class ContentAggregateError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 409
  ) {
    super(message);
  }
}

export const contentAggregateInclude = {
  mediaItems: { where: { deletedAt: null }, orderBy: { position: "asc" as const } },
  reelScript: { include: { beats: { orderBy: { position: "asc" as const } } } }
} satisfies Prisma.ContentItemInclude;
export type ContentAggregateRow = Prisma.ContentItemGetPayload<{ include: typeof contentAggregateInclude }>;
type Tx = Prisma.TransactionClient;

// Zod optional fields may explicitly contain undefined; Prisma's exact optional
// inputs require absent keys instead. Preserve null, which means clear a value.
function defined<T extends object>(value: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as { [K in keyof T]: Exclude<T[K], undefined> };
}

export function toContentRecord(row: ContentAggregateRow): ContentRecord {
  const { deletedAt: _deleted, mediaItems, reelScript, createdAt, updatedAt, plannedAt, scheduledAt, publishedAt, ...root } = row;
  return {
    ...Object.fromEntries(Object.entries(root).filter(([, value]) => value !== null)),
    id: row.id,
    workspaceId: row.workspaceId,
    platform: "INSTAGRAM",
    contentType: row.contentType,
    revision: row.revision,
    status: row.status,
    caption: row.caption,
    mediaItems: mediaItems.map(({ generationIntent: _intent, deletedAt: _removed, createdAt: created, updatedAt: updated, ...item }) => ({
      ...item,
      createdAt: created.toISOString(),
      updatedAt: updated.toISOString()
    })),
    reelScript: reelScript
      ? {
          ...reelScript,
          createdAt: reelScript.createdAt.toISOString(),
          updatedAt: reelScript.updatedAt.toISOString(),
          beats: reelScript.beats.map((beat) => ({ ...beat, createdAt: beat.createdAt.toISOString(), updatedAt: beat.updatedAt.toISOString() }))
        }
      : null,
    ...(plannedAt ? { plannedAt: plannedAt.toISOString() } : {}),
    ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}),
    ...(publishedAt ? { publishedAt: publishedAt.toISOString() } : {}),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString()
  };
}

export async function loadContentAggregate(tx: Tx, workspaceId: string, id: string): Promise<ContentAggregateRow> {
  const row = await tx.contentItem.findFirst({ where: { id, workspaceId, deletedAt: null }, include: contentAggregateInclude });
  if (!row) throw new ContentAggregateError("CONTENT_NOT_FOUND", "Content was not found", 404);
  return row;
}

// Root locking also makes the separate relation reads a coherent snapshot.
export async function lockContentRoot(tx: Tx, workspaceId: string, id: string, expectedRevision?: number): Promise<ContentAggregateRow> {
  await tx.$queryRaw`SELECT "id" FROM "content_items" WHERE "id" = ${id}::uuid AND "workspaceId" = ${workspaceId}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
  const row = await loadContentAggregate(tx, workspaceId, id);
  if (expectedRevision !== undefined && row.revision !== expectedRevision) throw new ContentConflictError();
  return row;
}

export async function getContentAggregate(workspaceId: string, id: string): Promise<ContentRecord> {
  return prisma.$transaction(async (tx) => toContentRecord(await lockContentRoot(tx, workspaceId, id)));
}

export function initialMediaItem(workspaceId: string, contentType: ContentType) {
  return { workspaceId, position: 0, mediaKind: contentType === "REEL" ? ("VIDEO" as const) : contentType === "STORY" ? null : ("IMAGE" as const) };
}

export async function createContentAggregate(
  tx: Tx,
  workspaceId: string,
  input: CreateContentInput,
  campaign?: {
    id: string;
    week: number;
    actionIndex: number;
  }
): Promise<ContentRecord> {
  const fields = createContentSchema.parse(input);
  if (campaign && !(await tx.campaign.findFirst({ where: { id: campaign.id, workspaceId, deletedAt: null }, select: { id: true } }))) {
    throw new ContentAggregateError("CAMPAIGN_NOT_FOUND", "Campaign was not found", 404);
  }
  const row = await tx.contentItem.create({
    data: {
      ...defined(fields),
      workspaceId,
      plannedAt: fields.plannedAt ? new Date(fields.plannedAt) : null,
      ...(campaign ? { campaignId: campaign.id, campaignWeek: campaign.week, campaignActionIndex: campaign.actionIndex } : {})
    }
  });
  await tx.contentMediaItem.create({ data: { ...initialMediaItem(workspaceId, fields.contentType), contentItemId: row.id } });
  // Child inserts advance revision; never return the pre-child parent snapshot.
  return toContentRecord(await loadContentAggregate(tx, workspaceId, row.id));
}

function assertEditable(row: ContentAggregateRow) {
  if (!["DRAFT", "IN_REVIEW"].includes(row.status)) throw new ContentAggregateError("CONTENT_LOCKED", "Only draft content can be edited");
}

function requireExactOrder(ids: string[], existing: string[]) {
  if (ids.length !== existing.length || new Set(ids).size !== ids.length || ids.some((id) => !existing.includes(id))) {
    throw new ContentAggregateError("CONTENT_ORDER_INVALID", "Reorder must contain every active item ID exactly once");
  }
}

async function requireOwnedAsset(tx: Tx, workspaceId: string, mediaAssetId: string | null | undefined) {
  if (mediaAssetId && !(await tx.mediaAsset.findFirst({ where: { id: mediaAssetId, workspaceId, deletedAt: null }, select: { id: true } }))) {
    throw new ContentAggregateError("CONTENT_MEDIA_INCOMPATIBLE", "Attachment is unavailable or incompatible");
  }
}

function insertAfter(ids: string[], id: string, afterId?: string | null) {
  if (afterId === undefined) return [...ids, id];
  if (afterId === null) return [id, ...ids];
  const index = ids.indexOf(afterId);
  if (index === -1) throw new ContentAggregateError("CONTENT_TARGET_NOT_FOUND", "The insertion target is not in this draft", 404);
  return [...ids.slice(0, index + 1), id, ...ids.slice(index + 1)];
}

async function orderMedia(tx: Tx, root: ContentAggregateRow, ids: string[]) {
  const items = await tx.contentMediaItem.findMany({
    where: { contentItemId: root.id, workspaceId: root.workspaceId, deletedAt: null },
    orderBy: { position: "asc" }
  });
  requireExactOrder(
    ids,
    items.map((item) => item.id)
  );
  if (items.every((item, i) => item.id === ids[i] && item.position === i)) return;
  const offset = Math.max(0, ...items.map((item) => item.position)) + ids.length + 1;
  for (let i = 0; i < ids.length; i++) await tx.contentMediaItem.update({ where: { id: ids[i]! }, data: { position: offset + i } });
  for (let i = 0; i < ids.length; i++) await tx.contentMediaItem.update({ where: { id: ids[i]! }, data: { position: i } });
}

async function orderBeats(tx: Tx, scriptId: string, ids: string[]) {
  const beats = await tx.contentReelBeat.findMany({ where: { reelScriptId: scriptId }, orderBy: { position: "asc" } });
  requireExactOrder(
    ids,
    beats.map((beat) => beat.id)
  );
  if (beats.every((beat, i) => beat.id === ids[i] && beat.position === i)) return;
  const offset = Math.max(0, ...beats.map((beat) => beat.position)) + ids.length + 1;
  for (let i = 0; i < ids.length; i++) await tx.contentReelBeat.update({ where: { id: ids[i]! }, data: { position: offset + i } });
  for (let i = 0; i < ids.length; i++) await tx.contentReelBeat.update({ where: { id: ids[i]! }, data: { position: i } });
}

export async function validateContentAggregate(tx: Tx, row: ContentAggregateRow): Promise<void> {
  const items = row.mediaItems;
  if (items.length < 1 || items.length > (row.contentType === "CAROUSEL" ? 10 : 1) || items.some((item, i) => item.position !== i)) {
    throw new ContentAggregateError("CONTENT_STRUCTURE_INVALID", "This format has an invalid item count or order");
  }
  if (row.contentType !== "REEL" && row.reelScript) throw new ContentAggregateError("CONTENT_STRUCTURE_INVALID", "Only a Reel may have a Reel script");
  const assetIds = items.flatMap((item) => (item.mediaAssetId ? [item.mediaAssetId] : []));
  const assets = await tx.mediaAsset.findMany({ where: { id: { in: assetIds }, workspaceId: row.workspaceId, deletedAt: null } });
  if (new Set(assetIds).size !== assetIds.length) throw new ContentAggregateError("CONTENT_MEDIA_DUPLICATE", "An asset may only appear once in this draft");
  for (const item of items) {
    if (
      (["POST", "CAROUSEL"].includes(row.contentType) && item.mediaKind !== "IMAGE") ||
      (row.contentType === "REEL" && item.mediaKind !== "VIDEO") ||
      (item.generationDurationSeconds !== null && item.mediaKind !== "VIDEO")
    ) {
      throw new ContentAggregateError("CONTENT_MEDIA_INCOMPATIBLE", "Media kind/settings do not match this format");
    }
    if (item.mediaAssetId) {
      const asset = assets.find((candidate) => candidate.id === item.mediaAssetId);
      if (!asset || !item.mediaKind || asset.mimeType !== (item.mediaKind === "VIDEO" ? "video/mp4" : "image/jpeg")) {
        throw new ContentAggregateError("CONTENT_MEDIA_INCOMPATIBLE", "Attachment is unavailable or incompatible");
      }
    }
  }
}

export async function mutateContentAggregate(workspaceId: string, id: string, raw: ContentMutationInput): Promise<ContentRecord> {
  const input = contentMutationSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    let root = await lockContentRoot(tx, workspaceId, id, input.expectedRevision);
    assertEditable(root);
    for (const operation of input.operations) {
      const item = "itemId" in operation ? root.mediaItems.find((candidate) => candidate.id === operation.itemId) : undefined;
      if ("itemId" in operation && !item) throw new ContentAggregateError("CONTENT_TARGET_NOT_FOUND", "Media item is not active in this draft", 404);
      switch (operation.type) {
        case "updateContent": {
          const { plannedAt, ...fields } = operation.fields;
          await tx.contentItem.update({
            where: { id },
            data: { ...defined(fields), ...(plannedAt === undefined ? {} : { plannedAt: plannedAt ? new Date(plannedAt) : null }) }
          });
          break;
        }
        case "updateMediaItem":
          await requireOwnedAsset(tx, workspaceId, operation.fields.mediaAssetId);
          await tx.contentMediaItem.update({
            where: { id: item!.id },
            data: { ...defined(operation.fields), ...("mediaAssetId" in operation.fields ? { generationIntent: randomUUID() } : {}) }
          });
          break;
        case "addMediaItem": {
          if (root.contentType !== "CAROUSEL" || root.mediaItems.length >= 10)
            throw new ContentAggregateError("CONTENT_ITEM_LIMIT", "Only Carousels may add items, up to ten");
          await requireOwnedAsset(tx, workspaceId, operation.fields.mediaAssetId);
          const added = await tx.contentMediaItem.create({
            data: { ...initialMediaItem(workspaceId, root.contentType), ...defined(operation.fields), contentItemId: id, position: root.mediaItems.length }
          });
          await orderMedia(
            tx,
            root,
            insertAfter(
              root.mediaItems.map((value) => value.id),
              added.id,
              operation.afterId
            )
          );
          break;
        }
        case "removeMediaItem": {
          if (root.contentType !== "CAROUSEL" || root.mediaItems.length === 1)
            throw new ContentAggregateError("CONTENT_ITEM_LIMIT", "Keep at least one logical media item");
          await tx.contentMediaItem.update({ where: { id: item!.id }, data: { deletedAt: new Date() } });
          await orderMedia(
            tx,
            root,
            root.mediaItems.filter((value) => value.id !== item!.id).map((value) => value.id)
          );
          break;
        }
        case "reorderMediaItems":
          await orderMedia(tx, root, operation.orderedIds);
          break;
        default: {
          if (root.contentType !== "REEL") throw new ContentAggregateError("CONTENT_STRUCTURE_INVALID", "Only Reels have scripts and beats");
          const script = root.reelScript ?? (await tx.contentReelScript.create({ data: { workspaceId, contentItemId: id }, include: { beats: true } }));
          const beat = "beatId" in operation ? script.beats.find((candidate) => candidate.id === operation.beatId) : undefined;
          if ("beatId" in operation && !beat) throw new ContentAggregateError("CONTENT_TARGET_NOT_FOUND", "Beat is not in this Reel", 404);
          if (operation.type === "updateReelScript") await tx.contentReelScript.update({ where: { id: script.id }, data: defined(operation.fields) });
          if (operation.type === "addReelBeat") {
            if (script.beats.length >= 100) throw new ContentAggregateError("CONTENT_BEAT_LIMIT", "A script may contain at most 100 beats");
            const added = await tx.contentReelBeat.create({
              data: { workspaceId, reelScriptId: script.id, position: script.beats.length, text: operation.text }
            });
            await orderBeats(
              tx,
              script.id,
              insertAfter(
                script.beats.map((value) => value.id),
                added.id,
                operation.afterId
              )
            );
          }
          if (operation.type === "updateReelBeat") await tx.contentReelBeat.update({ where: { id: beat!.id }, data: { text: operation.text } });
          if (operation.type === "removeReelBeat") {
            await tx.contentReelBeat.delete({ where: { id: beat!.id } });
            await orderBeats(
              tx,
              script.id,
              script.beats.filter((value) => value.id !== beat!.id).map((value) => value.id)
            );
          }
          if (operation.type === "reorderReelBeats") await orderBeats(tx, script.id, operation.orderedIds);
        }
      }
      root = await loadContentAggregate(tx, workspaceId, id);
    }
    await validateContentAggregate(tx, root);
    return toContentRecord(root);
  });
}

export interface ContentConversionPreview {
  from: ContentType;
  to: ContentType;
  requiresSelection: boolean;
  requiresConfirmation: boolean;
  retainedItemId: string | null;
  removedItemIds: string[];
  detachedAssetIds: string[];
  resetFields: string[];
}

const populated = (item: ContentAggregateRow["mediaItems"][number]) =>
  !!(
    item.mediaAssetId ||
    item.purpose?.trim() ||
    item.title?.trim() ||
    item.body?.trim() ||
    item.visualDirection?.trim() ||
    item.aspectRatio ||
    item.generationDurationSeconds
  );

export async function convertContentAggregate(
  workspaceId: string,
  id: string,
  raw: ConvertContentInput
): Promise<{
  applied: boolean;
  preview: ContentConversionPreview;
  content: ContentRecord;
}> {
  const input = convertContentSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const root = await lockContentRoot(tx, workspaceId, id, input.expectedRevision);
    assertEditable(root);
    const to = input.contentType;
    const candidate = input.retainMediaItemId
      ? root.mediaItems.find((item) => item.id === input.retainMediaItemId)
      : (root.mediaItems.find(populated) ?? root.mediaItems[0]!);
    if (!candidate) throw new ContentAggregateError("CONTENT_TARGET_NOT_FOUND", "Retained media item is not in this draft", 404);
    const requiresSelection = root.contentType !== to && to !== "CAROUSEL" && root.mediaItems.filter(populated).length > 1 && !input.retainMediaItemId;
    const kept = to === "CAROUSEL" ? root.mediaItems : [candidate];
    const removed = root.mediaItems.filter((item) => !kept.includes(item));
    const incompatible = kept.filter(
      (item) => item.mediaKind !== null && (to === "REEL" ? item.mediaKind !== "VIDEO" : to !== "STORY" && item.mediaKind !== "IMAGE")
    );
    const clearScript = to !== "REEL" && !!root.reelScript;
    const resetFields = [
      ...(clearScript ? ["reelScript"] : []),
      ...incompatible.flatMap((item) => ["mediaKind", "aspectRatio", "generationDurationSeconds"].map((key) => `mediaItems.${item.id}.${key}`))
    ];
    const preview: ContentConversionPreview = {
      from: root.contentType,
      to,
      requiresSelection,
      requiresConfirmation:
        requiresSelection ||
        removed.some(populated) ||
        incompatible.some(populated) ||
        !!(
          clearScript &&
          (root.reelScript!.hook?.trim() || root.reelScript!.intendedDurationSeconds || root.reelScript!.beats.some((beat) => beat.text.trim()))
        ),
      retainedItemId: to === "CAROUSEL" ? null : candidate.id,
      removedItemIds: removed.map((item) => item.id),
      detachedAssetIds: [...removed, ...incompatible].flatMap((item) => (item.mediaAssetId ? [item.mediaAssetId] : [])),
      resetFields
    };
    if (root.contentType === to) return { applied: true, preview, content: toContentRecord(root) };
    if (requiresSelection || (preview.requiresConfirmation && !input.confirmDestructive)) return { applied: false, preview, content: toContentRecord(root) };
    if (await tx.publishJob.findFirst({ where: { contentItemId: id, workspaceId, status: { in: ["QUEUED", "PROCESSING", "RETRY_WAIT"] } } })) {
      throw new ContentAggregateError("CONTENT_BUSY", "Cancel active publishing before converting");
    }
    if (removed.length)
      await tx.contentMediaItem.updateMany({ where: { id: { in: removed.map((item) => item.id) }, workspaceId }, data: { deletedAt: new Date() } });
    for (const item of incompatible)
      await tx.contentMediaItem.update({
        where: { id: item.id },
        data: { mediaAssetId: null, mediaKind: to === "REEL" ? "VIDEO" : "IMAGE", aspectRatio: null, generationDurationSeconds: null }
      });
    for (const item of kept.filter((item) => item.mediaKind === null && to !== "STORY"))
      await tx.contentMediaItem.update({ where: { id: item.id }, data: { mediaKind: to === "REEL" ? "VIDEO" : "IMAGE" } });
    if (clearScript) await tx.contentReelScript.delete({ where: { id: root.reelScript!.id } });
    await orderMedia(
      tx,
      root,
      kept.map((item) => item.id)
    );
    await tx.contentItem.update({ where: { id }, data: { contentType: to } });
    const updated = await loadContentAggregate(tx, workspaceId, id);
    await validateContentAggregate(tx, updated);
    return { applied: true, preview, content: toContentRecord(updated) };
  });
}
