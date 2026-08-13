import type { ContentStatus, MediaAsset, Prisma } from "@prisma/client";
import type { AiImageGenerationResult, ContentRecord, MediaAssetRecord } from "@markos/shared-types";
import type { GenerateImageForContentInput, RegisterPublicMediaInput, UploadMediaInput } from "@markos/validation";
import { generateImageAsset } from "../ai/image-client";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { selectPromptTemplateForRun } from "../prompts/prompt-service";
import { toContentRecord } from "../content/content-service";
import { recordAiTokenUsage, refundWorkspaceUsage, reserveWorkspaceUsage } from "../usage/usage-service";
import { localKeyForRoute, readStoredMedia, storeWorkspaceMedia } from "./storage-service";

export class MediaAssetNotFoundError extends Error {
  constructor() {
    super("Media asset was not found");
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
  constructor() {
    super("Uploaded media data is invalid");
  }
}

export class MediaImageGenerationInvalidError extends Error {
  constructor() {
    super("Generated image data is invalid");
  }
}

const imageAgentName = "IMAGE";
const localCurrency = "BHD";

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

  const usagePeriodDate = new Date();
  await reserveMediaUsage(workspaceId, input.type, bytes.byteLength, usagePeriodDate);

  try {
    const stored = await storeWorkspaceMedia({
      workspaceId,
      filename: input.filename,
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
        ...(input.width === undefined ? {} : { width: input.width }),
        ...(input.height === undefined ? {} : { height: input.height }),
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
  const generated = await generateImageAsset({
    aspectRatio: input.aspectRatio,
    prompt,
    ...(promptTemplate === undefined ? {} : { promptTemplate: { body: promptTemplate.body, version: promptTemplate.version } }),
    workspaceId
  });
  const promptVersion = promptTemplate?.version ?? generated.prompt_version;
  const bytes = Buffer.from(generated.base64_data, "base64");

  if (!isValidBase64Payload(generated.base64_data, bytes)) {
    throw new MediaImageGenerationInvalidError();
  }

  const usagePeriodDate = new Date();
  await reserveMediaUsage(workspaceId, "AI_GENERATED", bytes.byteLength, usagePeriodDate);

  try {
    const stored = await storeWorkspaceMedia({
      workspaceId,
      filename: generated.filename,
      bytes
    });
    const { mediaAsset, updatedContent } = await prisma.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.create({
        data: {
          workspaceId,
          type: "AI_GENERATED",
          filename: generated.filename,
          s3Key: stored.key,
          cdnUrl: stored.publicUrl,
          mimeType: generated.mime_type,
          sizeBytes: stored.sizeBytes,
          width: generated.width,
          height: generated.height
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
            publicUrl: stored.publicUrl,
            sizeBytes: stored.sizeBytes,
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
    await refundMediaUsage(workspaceId, "AI_GENERATED", bytes.byteLength, usagePeriodDate);
    throw error;
  }
}

export async function readPublicMediaFile(workspaceId: string, storedFilename: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      workspaceId,
      s3Key: localKeyForRoute(workspaceId, storedFilename),
      deletedAt: null
    }
  });

  if (!asset) {
    throw new MediaAssetNotFoundError();
  }

  return {
    bytes: await readStoredMedia(workspaceId, storedFilename),
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
  if (status === "PUBLISHED" || status === "FAILED") {
    throw new MediaContentLockedError();
  }
}

function isValidBase64Payload(value: string, bytes: Buffer): boolean {
  return bytes.byteLength > 0 && bytes.toString("base64").replace(/=+$/, "") === value.replace(/=+$/, "");
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
