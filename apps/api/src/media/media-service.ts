import type { ContentItem, ContentStatus, GeneratedMediaVariant, MediaAsset, Prisma } from "@prisma/client";
import type {
  AiImageGenerationResult,
  ContentRecord,
  GeneratedMediaVariantRecord,
  KnowledgeVaultEntry,
  MediaAssetRecord,
  VaultRagChunk,
  VisualStudioGenerationResult
} from "@markos/shared-types";
import type {
  AttachGeneratedMediaVariantInput,
  GenerateImageForContentInput,
  RegisterPublicMediaInput,
  RejectGeneratedMediaVariantInput,
  UploadMediaInput,
  VisualStudioGenerateInput,
  VisualStudioVariantListQueryInput
} from "@markos/validation";
import { generateImageAsset } from "../ai/image-client";
import { listCatalogGenerationContext } from "../catalog/catalog-service";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { selectPromptTemplateForRun } from "../prompts/prompt-service";
import { toContentRecord } from "../content/content-service";
import { recordAiTokenUsage, refundWorkspaceUsage, reserveWorkspaceUsage } from "../usage/usage-service";
import { listVaultSection } from "../vault/vault-service";
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

export class GeneratedMediaVariantNotFoundError extends Error {
  constructor() {
    super("Generated media variant was not found");
  }
}

export class GeneratedMediaVariantNotApprovedError extends Error {
  constructor() {
    super("Generated media variant must be approved before it can be attached to content");
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

export async function registerPublicMedia(
  workspaceId: string,
  input: RegisterPublicMediaInput
): Promise<MediaAssetRecord> {
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
  const promptTemplate = await selectPromptTemplateForRun(
    workspaceId,
    imageAgentName,
    `${workspaceId}:${contentItemId}:${input.aspectRatio}:${prompt}`
  );
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

export async function listGeneratedMediaVariants(
  workspaceId: string,
  input: VisualStudioVariantListQueryInput
): Promise<GeneratedMediaVariantRecord[]> {
  const rows = await prisma.generatedMediaVariant.findMany({
    where: {
      workspaceId,
      deletedAt: null,
      ...(input.status === undefined ? {} : { status: input.status })
    },
    orderBy: {
      createdAt: "desc"
    },
    take: input.limit
  });

  return toGeneratedMediaVariantRecords(workspaceId, rows);
}

export async function generateVisualStudioVariants(
  workspaceId: string,
  input: VisualStudioGenerateInput
): Promise<VisualStudioGenerationResult> {
  const contentItem =
    input.contentItemId === undefined
      ? null
      : await prisma.contentItem.findFirst({
          where: {
            id: input.contentItemId,
            workspaceId,
            deletedAt: null
          }
        });

  if (input.contentItemId !== undefined && contentItem === null) {
    throw new MediaContentItemNotFoundError();
  }

  if (contentItem !== null) {
    assertMediaEditable(contentItem.status);
  }

  const sourceMediaAssets = await findWorkspaceMediaAssets(workspaceId, input.sourceMediaAssetIds);
  const catalogContext = await listCatalogGenerationContext(workspaceId, {
    limit: 8,
    ...(input.offerId === undefined ? {} : { offerId: input.offerId }),
    ...(input.productId === undefined ? {} : { productId: input.productId })
  });
  const vaultContext = await readVisualVaultContext(workspaceId);
  const promptTemplate = await selectPromptTemplateForRun(
    workspaceId,
    imageAgentName,
    `${workspaceId}:visual-studio:${input.visualMode}:${input.aspectRatio}:${input.productId ?? "no-product"}:${input.offerId ?? "no-offer"}:${input.prompt ?? "auto"}`
  );
  const negativePrompt = buildVisualNegativePrompt(input.negativePrompt);
  const usagePeriodDate = new Date();

  await reserveWorkspaceUsage({ workspaceId, metric: "AI_IMAGE", amount: input.count, now: usagePeriodDate });

  let reservedStorageBytes = 0;

  try {
    const generatedVariants: Array<{
      generated: Awaited<ReturnType<typeof generateImageAsset>>;
      prompt: string;
      stored: Awaited<ReturnType<typeof storeWorkspaceMedia>>;
      variantIndex: number;
    }> = [];

    for (let index = 0; index < input.count; index += 1) {
      const prompt = buildVisualStudioPrompt({
        catalogContext,
        contentItem,
        input,
        negativePrompt,
        sourceMediaAssets,
        variantIndex: index + 1,
        vaultContext
      });
      const generated = await generateImageAsset({
        aspectRatio: input.aspectRatio,
        prompt,
        ...(promptTemplate === undefined ? {} : { promptTemplate: { body: promptTemplate.body, version: promptTemplate.version } }),
        workspaceId
      });
      const bytes = Buffer.from(generated.base64_data, "base64");

      if (!isValidBase64Payload(generated.base64_data, bytes)) {
        throw new MediaImageGenerationInvalidError();
      }

      await reserveWorkspaceUsage({ workspaceId, metric: "STORAGE_BYTES", amount: bytes.byteLength, now: usagePeriodDate });
      reservedStorageBytes += bytes.byteLength;

      const stored = await storeWorkspaceMedia({
        workspaceId,
        filename: generated.filename,
        bytes
      });

      generatedVariants.push({
        generated,
        prompt,
        stored,
        variantIndex: index + 1
      });
    }

    const records = await prisma.$transaction(async (tx) => {
      const created: Array<{ mediaAsset: MediaAsset; variant: GeneratedMediaVariant }> = [];

      for (const item of generatedVariants) {
        const mediaAsset = await tx.mediaAsset.create({
          data: {
            workspaceId,
            type: "AI_GENERATED",
            filename: item.generated.filename,
            s3Key: item.stored.key,
            cdnUrl: item.stored.publicUrl,
            mimeType: item.generated.mime_type,
            sizeBytes: item.stored.sizeBytes,
            width: item.generated.width,
            height: item.generated.height
          }
        });
        const promptVersion = promptTemplate?.version ?? item.generated.prompt_version;
        const model = item.generated.model || env.IMAGE_MODEL_PRIMARY;
        const variant = await tx.generatedMediaVariant.create({
          data: {
            workspaceId,
            mediaAssetId: mediaAsset.id,
            ...(input.contentItemId === undefined ? {} : { contentItemId: input.contentItemId }),
            ...(input.productId === undefined ? {} : { productId: input.productId }),
            ...(input.offerId === undefined ? {} : { offerId: input.offerId }),
            sourceMediaAssetIds: unique(input.sourceMediaAssetIds),
            visualMode: input.visualMode,
            aspectRatio: input.aspectRatio,
            prompt: item.prompt,
            negativePrompt,
            model,
            promptVersion,
            status: "PENDING_REVIEW",
            qualityStatus: "REVIEW_REQUIRED",
            metadata: buildVisualVariantMetadata({
              catalogContext,
              contentItem,
              input,
              sourceMediaAssets,
              variantIndex: item.variantIndex,
              vaultContext
            }) as Prisma.InputJsonValue
          }
        });

        await tx.aiInteraction.create({
          data: {
            workspaceId,
            agent: imageAgentName,
            promptVersion,
            prompt: {
              aspectRatio: input.aspectRatio,
              catalogContext,
              contentItemId: input.contentItemId,
              negativePrompt,
              offerId: input.offerId,
              productId: input.productId,
              prompt: item.prompt,
              sourceMediaAssetIds: unique(input.sourceMediaAssetIds),
              source: "visual_studio",
              visualMode: input.visualMode,
              ...(promptTemplate === undefined ? {} : { promptTemplate })
            } as unknown as Prisma.InputJsonValue,
            response: {
              mediaAssetId: mediaAsset.id,
              publicUrl: item.stored.publicUrl,
              providerPromptVersion: item.generated.prompt_version,
              sizeBytes: item.stored.sizeBytes,
              variantId: variant.id
            } as unknown as Prisma.InputJsonValue,
            tokensIn: item.generated.tokens_in,
            tokensOut: item.generated.tokens_out,
            costMinor: 0,
            currency: localCurrency,
            model
          }
        });
        await recordAiTokenUsage({
          client: tx,
          workspaceId,
          tokensIn: item.generated.tokens_in,
          tokensOut: item.generated.tokens_out,
          now: usagePeriodDate
        });

        created.push({ mediaAsset, variant });
      }

      return created.map((item) => toGeneratedMediaVariantRecord(item.variant, item.mediaAsset));
    });

    return {
      variants: records,
      model: records[0]?.model ?? env.IMAGE_MODEL_PRIMARY,
      promptVersion: records[0]?.promptVersion ?? promptTemplate?.version ?? "image.visual-studio"
    };
  } catch (error) {
    await refundWorkspaceUsage({ workspaceId, metric: "AI_IMAGE", amount: input.count, now: usagePeriodDate });

    if (reservedStorageBytes > 0) {
      await refundWorkspaceUsage({ workspaceId, metric: "STORAGE_BYTES", amount: reservedStorageBytes, now: usagePeriodDate });
    }

    throw error;
  }
}

export async function approveGeneratedMediaVariant(workspaceId: string, variantId: string): Promise<GeneratedMediaVariantRecord> {
  const current = await getGeneratedMediaVariantWithAsset(workspaceId, variantId);
  const updated = await prisma.generatedMediaVariant.update({
    where: {
      id: current.variant.id
    },
    data: {
      qualityStatus: "APPROVED",
      rejectionReason: null,
      status: "APPROVED"
    }
  });

  return toGeneratedMediaVariantRecord(updated, current.mediaAsset);
}

export async function rejectGeneratedMediaVariant(
  workspaceId: string,
  variantId: string,
  input: RejectGeneratedMediaVariantInput
): Promise<GeneratedMediaVariantRecord> {
  const current = await getGeneratedMediaVariantWithAsset(workspaceId, variantId);
  const updated = await prisma.generatedMediaVariant.update({
    where: {
      id: current.variant.id
    },
    data: {
      qualityStatus: "REJECTED",
      rejectionReason: input.reason,
      status: "REJECTED"
    }
  });

  return toGeneratedMediaVariantRecord(updated, current.mediaAsset);
}

export async function attachGeneratedMediaVariantToContent(
  workspaceId: string,
  variantId: string,
  input: AttachGeneratedMediaVariantInput
): Promise<ContentRecord> {
  const current = await getGeneratedMediaVariantWithAsset(workspaceId, variantId);

  if (current.variant.status !== "APPROVED") {
    throw new GeneratedMediaVariantNotApprovedError();
  }

  const contentItem = await prisma.contentItem.findFirst({
    where: {
      id: input.contentItemId,
      workspaceId,
      deletedAt: null
    }
  });

  if (!contentItem) {
    throw new MediaContentItemNotFoundError();
  }

  assertMediaEditable(contentItem.status);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.generatedMediaVariant.update({
      where: {
        id: current.variant.id
      },
      data: {
        contentItemId: contentItem.id
      }
    });

    return tx.contentItem.update({
      where: {
        id: contentItem.id
      },
      data: {
        mediaIds: Array.from(new Set([...contentItem.mediaIds, current.mediaAsset.id]))
      }
    });
  });

  return toContentRecord(updated);
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

export async function attachMediaToContent(
  workspaceId: string,
  contentItemId: string,
  mediaAssetId: string
): Promise<ContentRecord> {
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
  await assertGeneratedMediaApprovedForAttachment(workspaceId, mediaAsset.id);

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

export async function detachMediaFromContent(
  workspaceId: string,
  contentItemId: string,
  mediaAssetId: string
): Promise<ContentRecord> {
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

async function findWorkspaceMediaAssets(workspaceId: string, mediaAssetIds: string[]): Promise<MediaAsset[]> {
  const ids = unique(mediaAssetIds);

  if (ids.length === 0) {
    return [];
  }

  const rows = await prisma.mediaAsset.findMany({
    where: {
      id: {
        in: ids
      },
      workspaceId,
      deletedAt: null
    }
  });

  if (rows.length !== ids.length) {
    throw new MediaAssetNotFoundError();
  }

  return rows;
}

async function readVisualVaultContext(workspaceId: string): Promise<KnowledgeVaultEntry[]> {
  const [company, brand, tone, audience] = await Promise.all([
    listVaultSection(workspaceId, "COMPANY"),
    listVaultSection(workspaceId, "BRAND"),
    listVaultSection(workspaceId, "TONE"),
    listVaultSection(workspaceId, "AUDIENCE")
  ]);

  return [...company, ...brand, ...tone, ...audience].slice(0, 12);
}

async function getGeneratedMediaVariantWithAsset(
  workspaceId: string,
  variantId: string
): Promise<{ mediaAsset: MediaAsset; variant: GeneratedMediaVariant }> {
  const variant = await prisma.generatedMediaVariant.findFirst({
    where: {
      id: variantId,
      workspaceId,
      deletedAt: null
    }
  });

  if (!variant) {
    throw new GeneratedMediaVariantNotFoundError();
  }

  const mediaAsset = await prisma.mediaAsset.findFirst({
    where: {
      id: variant.mediaAssetId,
      workspaceId,
      deletedAt: null
    }
  });

  if (!mediaAsset) {
    throw new MediaAssetNotFoundError();
  }

  return { mediaAsset, variant };
}

async function assertGeneratedMediaApprovedForAttachment(workspaceId: string, mediaAssetId: string): Promise<void> {
  const variant = await prisma.generatedMediaVariant.findFirst({
    where: {
      mediaAssetId,
      workspaceId,
      deletedAt: null
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (variant !== null && variant.status !== "APPROVED") {
    throw new GeneratedMediaVariantNotApprovedError();
  }
}

async function toGeneratedMediaVariantRecords(
  workspaceId: string,
  rows: GeneratedMediaVariant[]
): Promise<GeneratedMediaVariantRecord[]> {
  const mediaAssets = await prisma.mediaAsset.findMany({
    where: {
      id: {
        in: rows.map((row) => row.mediaAssetId)
      },
      workspaceId,
      deletedAt: null
    }
  });
  const mediaById = new Map(mediaAssets.map((asset) => [asset.id, asset]));

  return rows.flatMap((row) => {
    const mediaAsset = mediaById.get(row.mediaAssetId);

    return mediaAsset === undefined ? [] : [toGeneratedMediaVariantRecord(row, mediaAsset)];
  });
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

function toGeneratedMediaVariantRecord(row: GeneratedMediaVariant, mediaAsset: MediaAsset): GeneratedMediaVariantRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    mediaAssetId: row.mediaAssetId,
    mediaAsset: toMediaAssetRecord(mediaAsset),
    ...(row.contentItemId === null ? {} : { contentItemId: row.contentItemId }),
    ...(row.productId === null ? {} : { productId: row.productId }),
    ...(row.offerId === null ? {} : { offerId: row.offerId }),
    sourceMediaAssetIds: row.sourceMediaAssetIds,
    visualMode: row.visualMode,
    aspectRatio: toAspectRatio(row.aspectRatio),
    prompt: row.prompt,
    ...(row.negativePrompt === null ? {} : { negativePrompt: row.negativePrompt }),
    model: row.model,
    promptVersion: row.promptVersion,
    status: row.status,
    qualityStatus: row.qualityStatus,
    ...(row.rejectionReason === null ? {} : { rejectionReason: row.rejectionReason }),
    metadata: toRecord(row.metadata),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function buildVisualStudioPrompt(input: {
  catalogContext: VaultRagChunk[];
  contentItem: ContentItem | null;
  input: VisualStudioGenerateInput;
  negativePrompt: string;
  sourceMediaAssets: MediaAsset[];
  variantIndex: number;
  vaultContext: KnowledgeVaultEntry[];
}): string {
  const userPrompt = input.input.prompt?.trim();
  const lines = [
    `Create a production-ready Instagram ${input.input.aspectRatio} visual for MARKOS AI.`,
    `Visual mode: ${visualModeInstruction(input.input.visualMode)}.`,
    userPrompt === undefined ? "Creative brief: use the approved Vault and catalog context below." : `Creative brief: ${userPrompt}.`,
    input.contentItem === null ? "" : `Content context: ${summarizeContentItem(input.contentItem)}.`,
    input.catalogContext.length === 0 ? "" : `Approved catalog context: ${summarizeCatalogContext(input.catalogContext)}.`,
    input.vaultContext.length === 0 ? "" : `Approved brand memory: ${summarizeVaultContext(input.vaultContext)}.`,
    input.sourceMediaAssets.length === 0 ? "" : `Reference media: ${summarizeSourceAssets(input.sourceMediaAssets)}.`,
    `Variant ${input.variantIndex}: make this distinct while staying on brand.`,
    "Use premium composition, clear focal hierarchy, strong mobile readability, and Bahrain/GCC market suitability.",
    "Do not invent logos, product details, prices, certifications, awards, or claims that are not in the approved context.",
    `Negative prompt: ${input.negativePrompt}.`
  ];

  return lines.filter(Boolean).join("\n");
}

function buildVisualVariantMetadata(input: {
  catalogContext: VaultRagChunk[];
  contentItem: ContentItem | null;
  input: VisualStudioGenerateInput;
  sourceMediaAssets: MediaAsset[];
  variantIndex: number;
  vaultContext: KnowledgeVaultEntry[];
}): Record<string, unknown> {
  return {
    catalogContext: input.catalogContext.map((chunk) => ({
      key: chunk.key,
      section: chunk.section,
      value: chunk.value
    })),
    content:
      input.contentItem === null
        ? null
        : {
            callToAction: input.contentItem.callToAction,
            captionAr: input.contentItem.captionAr,
            captionEn: input.contentItem.captionEn,
            contentPillar: input.contentItem.contentPillar,
            contentType: input.contentItem.contentType,
            hashtags: input.contentItem.hashtags
          },
    qualityPolicy: {
      humanApprovalRequired: true,
      noUnapprovedClaims: true,
      noUnreadableText: true,
      noUnlicensedAssetReuse: true
    },
    source: "visual_studio",
    sourceMediaAssets: input.sourceMediaAssets.map((asset) => ({
      filename: asset.filename,
      id: asset.id,
      mimeType: asset.mimeType,
      type: asset.type
    })),
    variantIndex: input.variantIndex,
    vaultContext: input.vaultContext.map((entry) => ({
      key: entry.key,
      section: entry.section,
      value: entry.value
    })),
    visualMode: input.input.visualMode
  };
}

function buildVisualNegativePrompt(input: string | undefined): string {
  return [
    "No distorted logos, malformed text, fake UI, fake awards, fake certifications, misleading price text, extra fingers, warped product details, low-resolution artifacts, cluttered stock-photo styling, or off-brand colors.",
    input?.trim() ?? ""
  ]
    .filter(Boolean)
    .join(" ");
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

function visualModeInstruction(mode: VisualStudioGenerateInput["visualMode"]): string {
  const instructions: Record<VisualStudioGenerateInput["visualMode"], string> = {
    AD_CREATIVE: "paid-social creative with clear offer hierarchy and conversion intent",
    BACKGROUND_VARIANT: "brand-safe background or supporting visual that can hold copy without clutter",
    LIFESTYLE_STORY: "aspirational lifestyle storytelling visual for Instagram feed or story adaptation",
    PRODUCT_PHOTO: "product-led hero visual with accurate product representation and premium lighting"
  };

  return instructions[mode];
}

function summarizeContentItem(contentItem: ContentItem): string {
  return compact([
    `type=${contentItem.contentType}`,
    contentItem.contentPillar === null ? "" : `pillar=${contentItem.contentPillar}`,
    contentItem.captionEn === null ? "" : `caption=${truncate(contentItem.captionEn, 180)}`,
    contentItem.callToAction === null ? "" : `cta=${contentItem.callToAction}`,
    contentItem.hashtags.length === 0 ? "" : `hashtags=${contentItem.hashtags.slice(0, 6).join(" ")}`
  ]).join("; ");
}

function summarizeCatalogContext(chunks: VaultRagChunk[]): string {
  return chunks
    .slice(0, 8)
    .map((chunk) => `${chunk.key}: ${summarizeObject(chunk.value)}`)
    .join(" | ");
}

function summarizeVaultContext(entries: KnowledgeVaultEntry[]): string {
  return entries
    .slice(0, 8)
    .map((entry) => `${entry.section}/${entry.key}: ${summarizeObject(entry.value)}`)
    .join(" | ");
}

function summarizeSourceAssets(assets: MediaAsset[]): string {
  return assets.map((asset) => `${asset.filename} (${asset.type}, ${asset.mimeType})`).join(", ");
}

function summarizeObject(value: Record<string, unknown>): string {
  const preferred = ["name", "title", "category", "description", "benefits", "priceMinor", "currency", "segment", "personality", "rules"];
  const selected = Object.fromEntries(preferred.flatMap((key) => (value[key] === undefined ? [] : [[key, value[key]]])));
  const summary = Object.keys(selected).length === 0 ? value : selected;

  return truncate(JSON.stringify(summary), 420);
}

function toAspectRatio(value: string): "1:1" | "4:5" | "9:16" {
  return value === "1:1" || value === "4:5" || value === "9:16" ? value : "4:5";
}

function toRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function compact(values: string[]): string[] {
  return values.filter((value) => value.length > 0);
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
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
