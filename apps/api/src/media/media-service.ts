import { randomUUID } from "node:crypto";
import type { ContentStatus, MediaAsset, Prisma } from "@prisma/client";
import type { AiImageGenerationResult, ContentRecord, MediaAssetRecord } from "@markos/shared-types";
import {
  attachMediaToContentSchema,
  instagramImageConstraints,
  validateInstagramImageMetadata,
  type GenerateImageForContentInput,
  type InstagramImageValidationCode,
  type RegisterPublicMediaInput,
  type UploadMediaInput
} from "@markos/validation";
import { generateImageAsset } from "../ai/image-client";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { selectPromptTemplateForRun } from "../prompts/prompt-service";
import { toContentRecord, loadContentAggregate, mutateContentAggregate, lockContentRoot, validateContentAggregate } from "../content/content-aggregate";
import { dispatchGeneration, applyGeneratedAsset } from "./generation-intent";
import { recordAiTokenUsage, refundWorkspaceUsage, reserveWorkspaceUsage } from "../usage/usage-service";
import { inspectJpegDimensions } from "./jpeg-inspection";
import { deleteStoredMedia, readStoredMedia, storageKeysForRoute, storeWorkspaceMedia } from "./storage-service";
import { ContentMediaValidationError, lockContentForMedia } from "./content-media-integrity";

export class MediaAssetNotFoundError extends Error {
  constructor() {
    super("Media asset was not found");
  }
}

export class MediaAssetInUseError extends Error {
  constructor() {
    super("Detach the media asset from every content item before deleting it");
  }
}

export class MediaContentItemNotFoundError extends Error {
  constructor() {
    super("Content item was not found");
  }
}

export class MediaContentLockedError extends Error {
  constructor() {
    super("Media cannot be changed for content in its current status");
  }
}

export class MediaUploadInvalidError extends Error {
  constructor(
    readonly reason: InstagramImageValidationCode | "INSTAGRAM_PUBLISH_JPEG_BYTES_INVALID" | "MEDIA_UPLOAD_DATA_INVALID" = "MEDIA_UPLOAD_DATA_INVALID"
  ) {
    super(mediaUploadErrorMessage(reason));
  }
}

export class MediaImageGenerationInvalidError extends Error {
  constructor() {
    super("The generated file is not a supported Instagram JPEG");
  }
}

const imageAgentName = "IMAGE";
const localCurrency = "BHD";
const maxDirectUploadBytes = instagramImageConstraints.maxSizeBytes;

export async function listMediaAssets(workspaceId: string): Promise<MediaAssetRecord[]> {
  const rows = await prisma.mediaAsset.findMany({
    where: {
      workspaceId,
      deletedAt: null
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 100
  });

  return rows.map(toMediaAssetRecord);
}

export async function registerPublicMedia(workspaceId: string, input: RegisterPublicMediaInput): Promise<MediaAssetRecord> {
  const usagePeriodDate = new Date();
  await reserveMediaUsage(workspaceId, input.type, input.sizeBytes, usagePeriodDate);

  try {
    const row = await prisma.mediaAsset.create({
      data: {
        workspaceId,
        type: input.type,
        filename: input.filename,
        s3Key: `external:${input.publicUrl}`,
        cdnUrl: input.publicUrl,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        ...(input.width === undefined ? {} : { width: input.width }),
        ...(input.height === undefined ? {} : { height: input.height }),
        ...(input.durationSeconds === undefined ? {} : { durationSeconds: input.durationSeconds })
      }
    });

    return toMediaAssetRecord(row);
  } catch (error) {
    await refundMediaUsage(workspaceId, input.type, input.sizeBytes, usagePeriodDate);
    throw error;
  }
}

export async function uploadMedia(workspaceId: string, input: UploadMediaInput): Promise<MediaAssetRecord> {
  const bytes = Buffer.from(input.base64Data, "base64");

  if (!isValidBase64Payload(input.base64Data, bytes)) {
    throw new MediaUploadInvalidError();
  }

  if (bytes.byteLength > maxDirectUploadBytes) {
    throw new MediaUploadInvalidError("INSTAGRAM_PUBLISH_IMAGE_TOO_LARGE");
  }

  const verifiedImageDimensions = input.type === "IMAGE" ? inspectJpegDimensions(bytes) : undefined;

  if (input.type === "IMAGE" && !verifiedImageDimensions) {
    throw new MediaUploadInvalidError("INSTAGRAM_PUBLISH_JPEG_BYTES_INVALID");
  }

  if (input.type === "IMAGE" && verifiedImageDimensions) {
    const [reason] = validateInstagramImageMetadata({
      filename: input.filename,
      height: verifiedImageDimensions.height,
      mimeType: input.mimeType,
      sizeBytes: bytes.byteLength,
      width: verifiedImageDimensions.width
    });

    if (reason) {
      throw new MediaUploadInvalidError(reason);
    }
  }

  const usagePeriodDate = new Date();
  await reserveMediaUsage(workspaceId, input.type, bytes.byteLength, usagePeriodDate);

  try {
    const stored = await storeWorkspaceMedia({
      workspaceId,
      filename: input.filename,
      contentType: input.mimeType,
      bytes
    });
    const row = await prisma.mediaAsset.create({
      data: {
        workspaceId,
        type: input.type,
        filename: input.filename,
        s3Key: stored.key,
        cdnUrl: stored.publicUrl,
        mimeType: input.mimeType,
        sizeBytes: stored.sizeBytes,
        ...(verifiedImageDimensions ? { width: verifiedImageDimensions.width } : input.width === undefined ? {} : { width: input.width }),
        ...(verifiedImageDimensions ? { height: verifiedImageDimensions.height } : input.height === undefined ? {} : { height: input.height }),
        ...(input.durationSeconds === undefined ? {} : { durationSeconds: input.durationSeconds })
      }
    });

    return toMediaAssetRecord(row);
  } catch (error) {
    await refundMediaUsage(workspaceId, input.type, bytes.byteLength, usagePeriodDate);
    throw error;
  }
}

export async function generateImageForContent(
  workspaceId: string,
  contentItemId: string,
  input: GenerateImageForContentInput
): Promise<AiImageGenerationResult> {
  const job = await dispatchGeneration(workspaceId, contentItemId, "IMAGE", input);
  const prompt = job.prompt;
  const aspectRatio = job.aspectRatio as "1:1" | "4:5" | "9:16";
  const usagePeriodDate = new Date();
  let imageUsageReserved = false;
  let reservedStorageBytes = 0;
  let stored: Awaited<ReturnType<typeof storeWorkspaceMedia>> | undefined;
  let outputPersisted = false;

  try {
    const promptTemplate = await selectPromptTemplateForRun(workspaceId, imageAgentName, `${workspaceId}:${job.contentMediaItemId}:${aspectRatio}:${prompt}`);
    await reserveWorkspaceUsage({ workspaceId, metric: "AI_IMAGE", now: usagePeriodDate });
    imageUsageReserved = true;
    const generated = await generateImageAsset({
      aspectRatio,
      prompt,
      ...(promptTemplate === undefined ? {} : { promptTemplate: { body: promptTemplate.body, version: promptTemplate.version } }),
      workspaceId
    });
    const promptVersion = promptTemplate?.version ?? generated.prompt_version;
    const bytes = Buffer.from(generated.base64_data, "base64");
    const verifiedImageDimensions = validateGeneratedImage(generated, bytes, aspectRatio);

    await reserveWorkspaceUsage({ workspaceId, metric: "STORAGE_BYTES", amount: bytes.byteLength, now: usagePeriodDate });
    reservedStorageBytes = bytes.byteLength;
    const storedMedia = await storeWorkspaceMedia({
      workspaceId,
      filename: generated.filename,
      contentType: generated.mime_type,
      bytes
    });
    stored = storedMedia;
    const { mediaAsset, updatedContent, attachmentError } = await prisma.$transaction(async (tx) => {
      const latest = await lockContentForMedia(tx, workspaceId, contentItemId);
      const asset = await tx.mediaAsset.create({
        data: {
          workspaceId,
          type: "AI_GENERATED",
          filename: generated.filename,
          s3Key: storedMedia.key,
          cdnUrl: storedMedia.publicUrl,
          mimeType: generated.mime_type,
          sizeBytes: storedMedia.sizeBytes,
          width: verifiedImageDimensions.width,
          height: verifiedImageDimensions.height
        }
      });
      const applied = await applyGeneratedAsset(tx, job, asset.id);
      const attachmentError = applied ? null : new ContentMediaValidationError("CONTENT_MEDIA_CHANGED", asset.id);
      const content = latest ? await loadContentAggregate(tx, workspaceId, contentItemId) : null;
      await tx.mediaGenerationJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          model: generated.model || env.IMAGE_MODEL_PRIMARY,
          outputMediaAssetId: asset.id,
          attachmentApplied: applied,
          completedAt: new Date(),
          progress: 100,
          errorCode: attachmentError?.code ?? null,
          errorMessage: attachmentError?.message ?? null
        }
      });
      await tx.aiInteraction.create({
        data: {
          workspaceId,
          agent: imageAgentName,
          accepted: !attachmentError,
          promptVersion,
          prompt: {
            aspectRatio,
            contentItemId,
            prompt,
            ...(promptTemplate === undefined ? {} : { promptTemplate }),
            contentMediaItemId: job.contentMediaItemId
          } as unknown as Prisma.InputJsonValue,
          response: {
            mediaAssetId: asset.id,
            publicUrl: storedMedia.publicUrl,
            sizeBytes: storedMedia.sizeBytes,
            providerPromptVersion: generated.prompt_version
          } as unknown as Prisma.InputJsonValue,
          tokensIn: generated.tokens_in,
          tokensOut: generated.tokens_out,
          costMinor: 0,
          currency: localCurrency,
          model: generated.model || env.IMAGE_MODEL_PRIMARY
        }
      });
      await recordAiTokenUsage({
        client: tx,
        workspaceId,
        tokensIn: generated.tokens_in,
        tokensOut: generated.tokens_out,
        now: usagePeriodDate
      });

      return {
        mediaAsset: asset,
        updatedContent: content,
        attachmentError
      };
    });
    outputPersisted = true;
    if (attachmentError) throw attachmentError;
    if (!updatedContent) throw new Error("Generated image attachment did not return a content item");

    return {
      contentItem: toContentRecord(updatedContent),
      mediaAsset: toMediaAssetRecord(mediaAsset),
      model: generated.model || env.IMAGE_MODEL_PRIMARY,
      prompt,
      promptVersion
    };
  } catch (error) {
    if (outputPersisted) throw error;
    await prisma.mediaGenerationJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorCode: "AI_IMAGE_GENERATION_FAILED", errorMessage: error instanceof Error ? error.message : "Image generation failed" }
    });
    if (stored !== undefined) {
      try {
        await deleteStoredMedia(workspaceId, stored.key);
      } catch {
        // Preserve the original generation or persistence error; storage cleanup can be retried operationally.
      }
    }
    if (reservedStorageBytes > 0) {
      await refundWorkspaceUsage({ workspaceId, metric: "STORAGE_BYTES", amount: reservedStorageBytes, now: usagePeriodDate });
    }
    if (imageUsageReserved) await refundWorkspaceUsage({ workspaceId, metric: "AI_IMAGE", now: usagePeriodDate });
    throw error;
  }
}

export async function readPublicMediaFile(workspaceId: string, storedFilename: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      workspaceId,
      s3Key: {
        in: storageKeysForRoute(workspaceId, storedFilename)
      },
      deletedAt: null
    }
  });

  if (!asset) {
    throw new MediaAssetNotFoundError();
  }

  return {
    bytes: await readStoredMedia(workspaceId, asset.s3Key),
    mimeType: asset.mimeType
  };
}

export async function attachMediaToContent(
  workspaceId: string,
  contentItemId: string,
  input: { contentMediaItemId: string; mediaAssetId: string; expectedRevision: number }
): Promise<ContentRecord> {
  input = attachMediaToContentSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const root = await lockContentRoot(tx, workspaceId, contentItemId, input.expectedRevision);
    assertMediaEditable(root.status);
    const item = root.mediaItems.find((item) => item.id === input.contentMediaItemId);
    if (!item) throw new ContentMediaValidationError("CONTENT_NOT_FOUND");
    const asset = await tx.mediaAsset.findFirst({ where: { id: input.mediaAssetId, workspaceId, deletedAt: null } });
    if (!asset) throw new MediaAssetNotFoundError();
    await tx.contentMediaItem.update({
      where: { id: item.id },
      data: { mediaAssetId: asset.id, mediaKind: item.mediaKind ?? (asset.mimeType === "video/mp4" ? "VIDEO" : "IMAGE"), generationIntent: randomUUID() }
    });
    const updated = await loadContentAggregate(tx, workspaceId, contentItemId);
    await validateContentAggregate(tx, updated);
    return toContentRecord(updated);
  });
}
export async function detachMediaFromContent(
  workspaceId: string,
  contentItemId: string,
  contentMediaItemId: string,
  expectedRevision: number
): Promise<ContentRecord> {
  return mutateContentAggregate(workspaceId, contentItemId, {
    expectedRevision,
    operations: [{ type: "updateMediaItem", itemId: contentMediaItemId, fields: { mediaAssetId: null } }]
  });
}
export async function updateContentMedia(
  workspaceId: string,
  contentItemId: string,
  input: { orderedIds: string[]; expectedRevision: number }
): Promise<ContentRecord> {
  return mutateContentAggregate(workspaceId, contentItemId, {
    expectedRevision: input.expectedRevision,
    operations: [{ type: "reorderMediaItems", orderedIds: input.orderedIds }]
  });
}

export async function deleteMediaAsset(workspaceId: string, mediaAssetId: string): Promise<{ id: string }> {
  const mediaAsset = await prisma.mediaAsset.findFirst({
    where: {
      id: mediaAssetId,
      workspaceId,
      deletedAt: null
    }
  });

  if (!mediaAsset) {
    throw new MediaAssetNotFoundError();
  }

  const attachedContentCount = await prisma.contentMediaItem.count({
    where: {
      workspaceId,
      deletedAt: null,
      mediaAssetId: mediaAsset.id
    }
  });

  if (attachedContentCount > 0) {
    throw new MediaAssetInUseError();
  }

  await prisma.mediaAsset.update({
    where: {
      id: mediaAsset.id
    },
    data: {
      deletedAt: new Date()
    }
  });
  await deleteStoredMedia(workspaceId, mediaAsset.s3Key);
  await refundWorkspaceUsage({ workspaceId, metric: "STORAGE_BYTES", amount: mediaAsset.sizeBytes });

  return { id: mediaAsset.id };
}

export function toMediaAssetRecord(row: MediaAsset): MediaAssetRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    type: row.type,
    filename: row.filename,
    publicUrl: row.cdnUrl,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    ...(row.width === null ? {} : { width: row.width }),
    ...(row.height === null ? {} : { height: row.height }),
    ...(row.durationSeconds === null ? {} : { durationSeconds: row.durationSeconds }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function assertMediaEditable(status: ContentStatus): void {
  if (status !== "DRAFT" && status !== "IN_REVIEW") {
    throw new MediaContentLockedError();
  }
}

function mediaUploadErrorMessage(reason: MediaUploadInvalidError["reason"]): string {
  const messages: Record<MediaUploadInvalidError["reason"], string> = {
    INSTAGRAM_PUBLISH_ASPECT_RATIO_UNSUPPORTED: "Choose a JPEG with an aspect ratio between 4:5 and 1.91:1",
    INSTAGRAM_PUBLISH_IMAGE_DIMENSIONS_REQUIRED: "MARKOS could not read the JPEG dimensions",
    INSTAGRAM_PUBLISH_IMAGE_SIZE_REQUIRED: "Choose a non-empty JPEG",
    INSTAGRAM_PUBLISH_IMAGE_TOO_LARGE: "Choose a JPEG no larger than 8 MB",
    INSTAGRAM_PUBLISH_IMAGE_WIDTH_UNSUPPORTED: "Choose a JPEG between 320 and 1440 pixels wide",
    INSTAGRAM_PUBLISH_JPEG_BYTES_INVALID: "Choose a valid JPEG file; changing a filename or MIME type is not enough",
    INSTAGRAM_PUBLISH_JPEG_REQUIRED: "Choose a JPEG with a .jpg or .jpeg filename and image/jpeg MIME type",
    MEDIA_UPLOAD_DATA_INVALID: "Uploaded media data is invalid"
  };

  return messages[reason];
}

function isValidBase64Payload(value: string, bytes: Buffer): boolean {
  return bytes.byteLength > 0 && bytes.toString("base64").replace(/=+$/, "") === value.replace(/=+$/, "");
}

function validateGeneratedImage(
  generated: {
    base64_data: string;
    filename: string;
    height: number;
    mime_type: string;
    size_bytes: number;
    width: number;
  },
  bytes: Buffer,
  aspectRatio: "1:1" | "4:5" | "9:16"
): { height: number; width: number } {
  if (!isValidBase64Payload(generated.base64_data, bytes) || generated.size_bytes !== bytes.byteLength) {
    throw new MediaImageGenerationInvalidError();
  }

  const verified = inspectJpegDimensions(bytes);
  const expectedDimensions = {
    "1:1": { height: 1024, width: 1024 },
    "4:5": { height: 1280, width: 1024 },
    "9:16": { height: 1792, width: 1008 }
  }[aspectRatio];

  if (
    verified === undefined ||
    verified.width !== generated.width ||
    verified.height !== generated.height ||
    verified.width !== expectedDimensions.width ||
    verified.height !== expectedDimensions.height
  ) {
    throw new MediaImageGenerationInvalidError();
  }

  const extension = generated.filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if (
    generated.mime_type.toLowerCase() !== "image/jpeg" ||
    (extension !== ".jpg" && extension !== ".jpeg") ||
    bytes.byteLength > instagramImageConstraints.maxSizeBytes
  ) {
    throw new MediaImageGenerationInvalidError();
  }

  if (aspectRatio !== "9:16") {
    const reasons = validateInstagramImageMetadata({
      filename: generated.filename,
      height: verified.height,
      mimeType: generated.mime_type,
      sizeBytes: bytes.byteLength,
      width: verified.width
    });

    if (reasons.length > 0) {
      throw new MediaImageGenerationInvalidError();
    }
  }

  return verified;
}

async function reserveMediaUsage(workspaceId: string, mediaType: string, sizeBytes: number, now: Date): Promise<void> {
  await reserveWorkspaceUsage({ workspaceId, metric: "STORAGE_BYTES", amount: sizeBytes, now });

  if (mediaType === "AI_GENERATED") {
    try {
      await reserveWorkspaceUsage({ workspaceId, metric: "AI_IMAGE", now });
    } catch (error) {
      await refundWorkspaceUsage({ workspaceId, metric: "STORAGE_BYTES", amount: sizeBytes, now });
      throw error;
    }
  }
}

async function refundMediaUsage(workspaceId: string, mediaType: string, sizeBytes: number, now: Date): Promise<void> {
  await refundWorkspaceUsage({ workspaceId, metric: "STORAGE_BYTES", amount: sizeBytes, now });

  if (mediaType === "AI_GENERATED") {
    await refundWorkspaceUsage({ workspaceId, metric: "AI_IMAGE", now });
  }
}
