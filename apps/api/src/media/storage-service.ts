import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../config/env";

export interface StoredMediaObject {
  key: string;
  publicUrl: string;
  sizeBytes: number;
}

const storageRoot = resolve(process.cwd(), env.MEDIA_STORAGE_DIR);

export async function storeWorkspaceMedia(input: { workspaceId: string; filename: string; bytes: Buffer }): Promise<StoredMediaObject> {
  const workspaceDir = resolve(storageRoot, input.workspaceId);

  if (!workspaceDir.startsWith(storageRoot)) {
    throw new Error("Invalid workspace media path");
  }

  await mkdir(workspaceDir, {
    recursive: true
  });

  const storedFilename = `${randomUUID()}${safeExtension(input.filename)}`;
  const filePath = resolve(workspaceDir, storedFilename);

  if (!filePath.startsWith(workspaceDir)) {
    throw new Error("Invalid media file path");
  }

  await writeFile(filePath, input.bytes);

  const key = `local:${input.workspaceId}/${storedFilename}`;
  const publicBaseUrl = (env.MEDIA_PUBLIC_BASE_URL ?? env.API_BASE_URL).replace(/\/$/, "");

  return {
    key,
    publicUrl: `${publicBaseUrl}/media-files/${input.workspaceId}/${storedFilename}`,
    sizeBytes: input.bytes.byteLength
  };
}

export async function readStoredMedia(workspaceId: string, storedFilename: string): Promise<Buffer> {
  const workspaceDir = resolve(storageRoot, workspaceId);
  const filePath = resolve(workspaceDir, storedFilename);

  if (!workspaceDir.startsWith(storageRoot) || !filePath.startsWith(workspaceDir)) {
    throw new Error("Invalid media file path");
  }

  return readFile(filePath);
}

export function localKeyForRoute(workspaceId: string, storedFilename: string): string {
  return `local:${workspaceId}/${storedFilename}`;
}

function safeExtension(filename: string): string {
  const extension = extname(filename).toLowerCase();

  if (!/^\.[a-z0-9]{1,8}$/.test(extension)) {
    return "";
  }

  return extension;
}
