import { createHash } from "node:crypto";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand
} from "@aws-sdk/client-s3";
import { encryptBackup } from "./backup-crypto";

export const recoveryPrefix = "markos-recovery/v1/runs/";
export type BackupObject = { key: string; bytes: number; sha256: string };
export function assertRecoveryKey(key: string): void {
  if (!key.startsWith(recoveryPrefix) || key.includes("..") || !/^[A-Za-z0-9/_.-]+$/.test(key)) throw new Error("BACKUP_OBJECT_KEY_INVALID");
}
export async function* objectBytes(client: S3Client, bucket: string, key: string): AsyncGenerator<Uint8Array> {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body || !(Symbol.asyncIterator in response.Body)) throw new Error("BACKUP_OBJECT_READ_FAILED");
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) yield chunk;
}
export async function putEncryptedBackup(
  client: S3Client,
  bucket: string,
  key: string,
  source: AsyncIterable<Uint8Array>,
  master: Buffer
): Promise<BackupObject> {
  assertRecoveryKey(key);
  const multipart = await client.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: "application/octet-stream" }));
  if (!multipart.UploadId) throw new Error("BACKUP_UPLOAD_INIT_FAILED");
  const UploadId = multipart.UploadId,
    parts: { ETag: string; PartNumber: number }[] = [];
  const digest = createHash("sha256");
  let bytes = 0,
    pending: Buffer[] = [],
    size = 0;
  const upload = async () => {
    if (parts.length >= 10000) throw new Error("BACKUP_TOO_LARGE");
    const body = Buffer.concat(pending, size);
    pending = [];
    size = 0;
    const PartNumber = parts.length + 1;
    const part = await client.send(new UploadPartCommand({ Bucket: bucket, Key: key, UploadId, PartNumber, Body: body }));
    if (!part.ETag) throw new Error("BACKUP_UPLOAD_PART_FAILED");
    parts.push({ ETag: part.ETag, PartNumber });
  };
  try {
    for await (const chunk of encryptBackup(source, master)) {
      digest.update(chunk);
      bytes += chunk.length;
      pending.push(chunk);
      size += chunk.length;
      if (size >= 8 * 1024 * 1024) await upload();
    }
    if (size) await upload();
    await client.send(new CompleteMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId, MultipartUpload: { Parts: parts } }));
  } catch {
    await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId })).catch(() => {});
    throw new Error("BACKUP_UPLOAD_FAILED");
  }
  const sha256 = digest.digest("hex"),
    check = createHash("sha256");
  let downloaded = 0;
  for await (const chunk of objectBytes(client, bucket, key)) {
    downloaded += chunk.length;
    if (downloaded > bytes) throw new Error("BACKUP_VERIFY_FAILED");
    check.update(chunk);
  }
  if (downloaded !== bytes || check.digest("hex") !== sha256) throw new Error("BACKUP_VERIFY_FAILED");
  return { key, bytes, sha256 };
}
export async function finishBackup(client: S3Client, bucket: string, key: string, manifest: unknown): Promise<void> {
  assertRecoveryKey(key);
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: JSON.stringify(manifest), ContentType: "application/json", IfNoneMatch: "*" }));
}
