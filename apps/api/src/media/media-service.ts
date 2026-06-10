import type { ContentStatus, MediaAsset } from "@prisma/client";
import type { ContentRecord, MediaAssetRecord } from "@markos/shared-types";
import type { RegisterPublicMediaInput, UploadMediaInput } from "@markos/validation";
import { prisma } from "../db/prisma";
import { toContentRecord } from "../content/content-service";
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
}

export async function uploadMedia(workspaceId: string, input: UploadMediaInput): Promise<MediaAssetRecord> {
  const bytes = Buffer.from(input.base64Data, "base64");

  if (bytes.byteLength === 0 || bytes.toString("base64").replace(/=+$/, "") !== input.base64Data.replace(/=+$/, "")) {
    throw new MediaUploadInvalidError();
  }

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
