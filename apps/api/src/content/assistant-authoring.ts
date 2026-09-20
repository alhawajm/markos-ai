import type { Prisma } from "@prisma/client";
import type { MarkosAuthoringSnapshot, AssistantActionState } from "@markos/shared-types";
import { assistantResultSchema, contentMutationSchema, type AssistantResult } from "@markos/validation";
import {
  ContentAggregateError,
  loadContentAggregate,
  lockContentRoot,
  mutateContentAggregateInTransaction,
  convertContentAggregate,
  type ContentAggregateRow
} from "./content-aggregate";

export async function authoringSnapshot(tx: Prisma.TransactionClient, root: ContentAggregateRow): Promise<MarkosAuthoringSnapshot> {
  const assets = await tx.mediaAsset.findMany({
    where: { workspaceId: root.workspaceId, deletedAt: null, id: { in: root.mediaItems.flatMap((item) => (item.mediaAssetId ? [item.mediaAssetId] : [])) } },
    select: { id: true, mimeType: true, width: true, height: true, durationSeconds: true }
  });
  return {
    id: root.id,
    contentType: root.contentType,
    revision: root.revision,
    editable: ["DRAFT", "IN_REVIEW"].includes(root.status),
    caption: root.caption,
    contentPillar: root.contentPillar,
    campaignGoal: root.campaignGoal,
    tone: root.tone,
    brief: root.brief,
    mediaItems: root.mediaItems.map((item) => {
      const asset = assets.find((asset) => asset.id === item.mediaAssetId);
      return {
        id: item.id,
        position: item.position,
        mediaKind: item.mediaKind,
        purpose: item.purpose,
        title: item.title,
        body: item.body,
        visualDirection: item.visualDirection,
        aspectRatio: item.aspectRatio,
        generationDurationSeconds: item.generationDurationSeconds,
        media: asset ? { mimeType: asset.mimeType, width: asset.width, height: asset.height, durationSeconds: asset.durationSeconds } : null
      };
    }),
    reelScript: root.reelScript
      ? {
          id: root.reelScript.id,
          hook: root.reelScript.hook,
          intendedDurationSeconds: root.reelScript.intendedDurationSeconds,
          beats: root.reelScript.beats.map(({ id, position, text }) => ({ id, position, text }))
        }
      : null
  };
}

export async function destructiveConsequences(tx: Prisma.TransactionClient, root: ContentAggregateRow, result: AssistantResult): Promise<string[]> {
  const consequences: string[] = [];
  if (result.conversion) {
    const preview = await convertContentAggregate(
      root.workspaceId,
      root.id,
      {
        expectedRevision: root.revision,
        contentType: result.conversion.contentType,
        confirmDestructive: false,
        ...(result.conversion.retainMediaItemId ? { retainMediaItemId: result.conversion.retainMediaItemId } : {})
      },
      tx,
      true
    );
    if (preview.preview.requiresSelection)
      throw new ContentAggregateError("CONTENT_RETAIN_SELECTION_REQUIRED", "Specify the stable item ID to retain before proposing this conversion");
    if (preview.preview.requiresConfirmation)
      consequences.push(
        `Convert to ${result.conversion.contentType}; retain ${preview.preview.retainedItemId ?? "compatible items"}; remove items ${preview.preview.removedItemIds.join(", ") || "none"}; detach assets ${preview.preview.detachedAssetIds.join(", ") || "none"}; reset ${preview.preview.resetFields.join(", ") || "none"}.`
      );
  }
  for (const op of result.operations) {
    if (op.type === "removeMediaItem") {
      const item = root.mediaItems.find((item) => item.id === op.itemId);
      if (
        item &&
        [item.mediaAssetId, item.purpose, item.title, item.body, item.visualDirection, item.aspectRatio, item.generationDurationSeconds].some(Boolean)
      )
        consequences.push(`Remove populated media item ${item.id}; keep its Library asset.`);
    }
    if (
      (op.type === "removeReelBeat" || (op.type === "updateReelBeat" && !op.text.trim())) &&
      root.reelScript?.beats.some((beat) => beat.id === op.beatId && beat.text.trim())
    )
      consequences.push(`Remove script text from beat ${op.beatId}.`);
    if (
      op.type === "updateReelScript" &&
      op.field === "hook" &&
      (op.value === null || (typeof op.value === "string" && !op.value.trim())) &&
      root.reelScript?.hook?.trim()
    )
      consequences.push("Clear the saved Reel hook.");
  }
  return consequences;
}

/** Caller transaction also records the run result, making edits and their receipt indivisible. */
export async function applyAssistantBatch(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  contentId: string,
  revision: number,
  raw: AssistantResult
): Promise<AssistantActionState> {
  const result = assistantResultSchema.parse(raw);
  let root = await lockContentRoot(tx, workspaceId, contentId, revision);
  const bindings: Record<string, string> = {};
  const resolve = (ref: string) => {
    if (!ref.startsWith("$")) return ref;
    if (!Object.hasOwn(bindings, ref)) throw new ContentAggregateError("AI_REFERENCE_INVALID", "Reference must be created earlier in this batch", 400);
    return bindings[ref]!;
  };
  if (result.conversion) {
    await convertContentAggregate(
      workspaceId,
      contentId,
      {
        expectedRevision: root.revision,
        contentType: result.conversion.contentType,
        confirmDestructive: true,
        ...(result.conversion.retainMediaItemId ? { retainMediaItemId: result.conversion.retainMediaItemId } : {})
      },
      tx
    );
    root = await loadContentAggregate(tx, workspaceId, contentId);
  }
  for (const op of result.operations) {
    const before = root;
    if ("ref" in op && Object.hasOwn(bindings, op.ref)) throw new ContentAggregateError("AI_REFERENCE_INVALID", "Duplicate local reference", 400);
    let operation: unknown;
    switch (op.type) {
      case "updateContent":
        operation = { type: op.type, fields: { [op.field]: op.value } };
        break;
      case "updateMediaItem":
        operation = { type: op.type, itemId: resolve(op.itemId), fields: { [op.field]: op.value } };
        break;
      case "addMediaItem":
        operation = { type: op.type, fields: { purpose: op.purpose, title: op.title, body: op.body, visualDirection: op.visualDirection } };
        break;
      case "removeMediaItem":
        operation = { type: op.type, itemId: resolve(op.itemId) };
        break;
      case "reorderMediaItems":
      case "reorderReelBeats":
        operation = { type: op.type, orderedIds: op.orderedIds.map(resolve) };
        break;
      case "updateReelScript":
        operation = { type: op.type, fields: { [op.field]: op.value } };
        break;
      case "addReelBeat":
        operation = { type: op.type, text: op.text };
        break;
      case "updateReelBeat":
        operation = { type: op.type, beatId: resolve(op.beatId), text: op.text };
        break;
      case "removeReelBeat":
        operation = { type: op.type, beatId: resolve(op.beatId) };
        break;
    }
    await mutateContentAggregateInTransaction(
      tx,
      workspaceId,
      contentId,
      contentMutationSchema.parse({ expectedRevision: root.revision, operations: [operation] })
    );
    root = await loadContentAggregate(tx, workspaceId, contentId);
    if (op.type === "addMediaItem") bindings[op.ref] = root.mediaItems.find((item) => !before.mediaItems.some((old) => old.id === item.id))!.id;
    if (op.type === "addReelBeat") bindings[op.ref] = root.reelScript!.beats.find((beat) => !before.reelScript?.beats.some((old) => old.id === beat.id))!.id;
  }
  const generation = result.generation.map(({ itemId }) => ({ itemId: resolve(itemId), status: "PENDING" as const }));
  if (new Set(generation.map((item) => item.itemId)).size !== generation.length)
    throw new ContentAggregateError("AI_GENERATION_DUPLICATE", "Request generation once per item", 400);
  for (const request of generation) {
    const item = root.mediaItems.find((item) => item.id === request.itemId);
    if (!item || !item.mediaKind || !item.visualDirection?.trim() || !["DRAFT", "IN_REVIEW"].includes(root.status))
      throw new ContentAggregateError("AI_GENERATION_TARGET_INVALID", "Generation requires an active editable item with kind and direction", 400);
  }
  return { editsSaved: !!result.conversion || result.operations.length > 0, revision: root.revision, bindings, confirmation: null, generation };
}
