import { randomUUID } from "node:crypto";
import type { MediaGenerationJob, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { generateImageForContentSchema, generateVideoForContentSchema } from "@markos/validation";
import { ContentAggregateError, lockContentRoot, loadContentAggregate } from "../content/content-aggregate";

export type GenerationRequest = {
  contentMediaItemId: string;
  expectedRevision: number;
  prompt?: string | undefined;
  aspectRatio?: string | undefined;
  durationSeconds?: number | undefined;
};
const ratios = { "1:1": "SQUARE", "4:5": "PORTRAIT", "9:16": "VERTICAL" } as const;
const externalRatios = { SQUARE: "1:1", PORTRAIT: "4:5", VERTICAL: "9:16" } as const;

export async function dispatchGeneration(workspaceId: string, contentItemId: string, kind: "IMAGE" | "VIDEO", input: GenerationRequest) {
  input = kind === "IMAGE" ? generateImageForContentSchema.parse(input) : generateVideoForContentSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const root = await lockContentRoot(tx, workspaceId, contentItemId, input.expectedRevision);
    if (!["DRAFT", "IN_REVIEW"].includes(root.status)) throw new ContentAggregateError("CONTENT_LOCKED", "Only draft media can be generated");
    const item = root.mediaItems.find((item) => item.id === input.contentMediaItemId);
    if (!item) throw new ContentAggregateError("CONTENT_TARGET_NOT_FOUND", "Media item was not found", 404);
    if ((item.mediaKind && item.mediaKind !== kind) || (kind === "VIDEO" && !["REEL", "STORY"].includes(root.contentType)))
      throw new ContentAggregateError("CONTENT_MEDIA_TYPE_INCOMPATIBLE", "Generation kind does not match this item");
    const prompt = (input.prompt ?? item.visualDirection)?.trim();
    if (!prompt || prompt.length < 3) throw new ContentAggregateError("MEDIA_DIRECTION_REQUIRED", "Add a visual direction before generating media", 400);
    const aspectRatio =
      input.aspectRatio ?? (item.aspectRatio ? externalRatios[item.aspectRatio] : root.contentType === "STORY" || kind === "VIDEO" ? "9:16" : "4:5");
    if (!(aspectRatio in ratios) || (kind === "VIDEO" && aspectRatio !== "9:16"))
      throw new ContentAggregateError("MEDIA_SETTINGS_INVALID", "Unsupported aspect ratio", 400);
    const duration = kind === "VIDEO" ? (input.durationSeconds ?? item.generationDurationSeconds ?? 8) : null;
    if (duration !== null && ![4, 8, 12].includes(duration)) throw new ContentAggregateError("MEDIA_SETTINGS_INVALID", "Choose 4, 8 or 12 seconds", 400);
    const target = await tx.contentMediaItem.update({
      where: { id: item.id },
      data: {
        mediaKind: kind,
        visualDirection: prompt,
        aspectRatio: ratios[aspectRatio as keyof typeof ratios],
        generationDurationSeconds: duration,
        generationIntent: randomUUID()
      }
    });
    const current = await loadContentAggregate(tx, workspaceId, root.id);
    return tx.mediaGenerationJob.create({
      data: {
        workspaceId,
        contentItemId,
        contentMediaItemId: target.id,
        generationIntent: target.generationIntent,
        requestedRevision: current.revision,
        kind,
        prompt,
        aspectRatio,
        durationSeconds: duration,
        provider: kind === "VIDEO" ? "openai_sora" : "configured_image_provider",
        status: kind === "IMAGE" ? "STARTING" : "QUEUED"
      }
    });
  });
}

/** Caller holds the aggregate root lock. Job progress never touches authoring rows. */
export async function applyGeneratedAsset(tx: Prisma.TransactionClient, job: MediaGenerationJob, mediaAssetId: string): Promise<boolean> {
  const root = await tx.contentItem.findFirst({
    where: { id: job.contentItemId, workspaceId: job.workspaceId, deletedAt: null, status: { in: ["DRAFT", "IN_REVIEW"] } }
  });
  if (!root) return false;
  const updated = await tx.contentMediaItem.updateMany({
    where: {
      id: job.contentMediaItemId,
      contentItemId: root.id,
      workspaceId: job.workspaceId,
      deletedAt: null,
      generationIntent: job.generationIntent,
      mediaKind: job.kind
    },
    data: { mediaAssetId }
  });
  return updated.count === 1;
}
