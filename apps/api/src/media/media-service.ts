import type { ContentStatus, MediaAsset, Prisma } from "@prisma/client";
import type { AiImageGenerationResult, ContentRecord, MediaAssetRecord } from "@markos/shared-types";
import {
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
import { toContentRecord } from "../content/content-service";
import { recordAiTokenUsage, refundWorkspaceUsage, reserveWorkspaceUsage } from "../usage/usage-service";
import { inspectJpegDimensions } from "./jpeg-inspection";
import { deleteStoredMedia, readStoredMedia, storageKeysForRoute, storeWorkspaceMedia } from "./storage-service";

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
  const contentItem = await prisma.contentItem.findFirst({
    where: {
      id: contentItemId,
      workspaceId,
      deletedAt: null
    }
  });

  if (!contentItem) {
    throw new MediaContentItemNotFoundError();
  }

  assertMediaEditable(contentItem.status);

  const prompt = input.prompt?.trim() || promptFromContent(contentItem);
  const promptTemplate = await selectPromptTemplateForRun(workspaceId, imageAgentName, `${workspaceId}:${contentItemId}:${input.aspectRatio}:${prompt}`);
  const usagePeriodDate = new Date();
  await reserveWorkspaceUsage({ workspaceId, metric: "AI_IMAGE", now: usagePeriodDate });
  let reservedStorageBytes = 0;
  let stored: Awaited<ReturnType<typeof storeWorkspaceMedia>> | undefined;

  try {
    const generated = await generateImageAsset({
      aspectRatio: input.aspectRatio,
      prompt,
      ...(promptTemplate === undefined ? {} : { promptTemplate: { body: promptTemplate.body, version: promptTemplate.version } }),
      workspaceId
    });
    const promptVersion = promptTemplate?.version ?? generated.prompt_version;
    const bytes = Buffer.from(generated.base64_data, "base64");
    const verifiedImageDimensions = validateGeneratedImage(generated, bytes, input.aspectRatio);

    await reserveWorkspaceUsage({ workspaceId, metric: "STORAGE_BYTES", amount: bytes.byteLength, now: usagePeriodDate });
    reservedStorageBytes = bytes.byteLength;
    const storedMedia = await storeWorkspaceMedia({
      workspaceId,
      filename: generated.filename,
      contentType: generated.mime_type,
      bytes
    });
    stored = storedMedia;
    const { mediaAsset, updatedContent } = await prisma.$transaction(async (tx) => {
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
      const content = await tx.contentItem.update({
        where: {
          id: contentItem.id
        },
        data: {
          mediaIds: Array.from(new Set([...contentItem.mediaIds, asset.id]))
        }
      });

      await tx.aiInteraction.create({
        data: {
          workspaceId,
          agent: imageAgentName,
          promptVersion,
          prompt: {
            aspectRatio: input.aspectRatio,
            contentItemId,
            prompt,
            ...(promptTemplate === undefined ? {} : { promptTemplate }),
            source: contentImagePromptSource(contentItem)
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
        updatedContent: content
      };
    });

    return {
      contentItem: toContentRecord(updatedContent),
      mediaAsset: toMediaAssetRecord(mediaAsset),
      model: generated.model || env.IMAGE_MODEL_PRIMARY,
      prompt,
      promptVersion
    };
  } catch (error) {
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
    await refundWorkspaceUsage({ workspaceId, metric: "AI_IMAGE", now: usagePeriodDate });
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

export async function attachMediaToContent(workspaceId: string, contentItemId: string, mediaAssetId: string): Promise<ContentRecord> {
  const [contentItem, mediaAsset] = await Promise.all([
    prisma.contentItem.findFirst({
      where: {
        id: contentItemId,
        workspaceId,
        deletedAt: null
      }
    }),
    prisma.mediaAsset.findFirst({
      where: {
        id: mediaAssetId,
        workspaceId,
        deletedAt: null
      }
    })
  ]);

  if (!contentItem) {
    throw new MediaContentItemNotFoundError();
  }

  if (!mediaAsset) {
    throw new MediaAssetNotFoundError();
  }

  assertMediaEditable(contentItem.status);

  const mediaIds = Array.from(new Set([...contentItem.mediaIds, mediaAsset.id]));
  const row = await prisma.contentItem.update({
    where: {
      id: contentItem.id
    },
    data: {
      mediaIds
    }
  });

  return toContentRecord(row);
}

export async function detachMediaFromContent(workspaceId: string, contentItemId: string, mediaAssetId: string): Promise<ContentRecord> {
  const contentItem = await prisma.contentItem.findFirst({
    where: {
      id: contentItemId,
      workspaceId,
      deletedAt: null
    }
  });

  if (!contentItem) {
    throw new MediaContentItemNotFoundError();
  }

  assertMediaEditable(contentItem.status);

  const row = await prisma.contentItem.update({
    where: {
      id: contentItem.id
    },
    data: {
      mediaIds: contentItem.mediaIds.filter((id) => id !== mediaAssetId)
    }
  });

  return toContentRecord(row);
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

  const attachedContentCount = await prisma.contentItem.count({
    where: {
      workspaceId,
      deletedAt: null,
      mediaIds: {
        has: mediaAsset.id
      }
    }
  });

  if (attachedContentCount > 0) {
    throw new MediaAssetInUseError();
  }

  await deleteStoredMedia(workspaceId, mediaAsset.s3Key);
  await prisma.mediaAsset.update({
    where: {
      id: mediaAsset.id
    },
    data: {
      deletedAt: new Date()
    }
  });
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
  aspectRatio: GenerateImageForContentInput["aspectRatio"]
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

function promptFromContent(contentItem: {
  callToAction: string | null;
  captionAr: string | null;
  captionEn: string | null;
  contentPillar: string | null;
  contentType: string;
  hashtags: string[];
}): string {
  const caption = contentItem.captionEn ?? contentItem.captionAr ?? "Instagram marketing visual";
  const pillar = contentItem.contentPillar ?? "brand awareness";
  const hashtags = contentItem.hashtags.slice(0, 5).join(" ");

  return [
    `Create a Bahrain-ready Instagram ${contentItem.contentType.toLowerCase()} visual.`,
    `Theme: ${pillar}.`,
    `Caption context: ${caption}.`,
    contentItem.callToAction ? `Call to action: ${contentItem.callToAction}.` : "",
    hashtags ? `Hashtag context: ${hashtags}.` : "",
    "No unreadable text, distorted logos, or generic stock-photo styling."
  ]
    .filter(Boolean)
    .join(" ");
}

function contentImagePromptSource(contentItem: {
  callToAction: string | null;
  captionAr: string | null;
  captionEn: string | null;
  contentPillar: string | null;
  contentType: string;
  hashtags: string[];
}): Record<string, unknown> {
  return {
    contentType: contentItem.contentType,
    captionEn: contentItem.captionEn,
    captionAr: contentItem.captionAr,
    hashtags: contentItem.hashtags,
    callToAction: contentItem.callToAction,
    contentPillar: contentItem.contentPillar
  };
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
