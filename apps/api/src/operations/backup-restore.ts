import { createHash } from "node:crypto";
import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { S3Client } from "@aws-sdk/client-s3";
import { backupMasterKey, decryptBackup, verifyBackupManifest } from "./backup-crypto";
import { objectBytes, recoveryPrefix, type BackupObject } from "./backup-store";

const backupObject = z.object({ key: z.string(), bytes: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
const manifestSchema = z.object({
  format: z.literal("markos-recovery-v1"),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  keyId: z.string().regex(/^[a-f0-9]{16}$/),
  database: backupObject,
  media: z.array(backupObject.extend({ id: z.uuid(), workspaceId: z.uuid(), sourceKey: z.string() })).max(100000)
});
export function parseRecoveryManifest(value: unknown, master: Buffer, run: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z_[a-f0-9-]{36}$/.test(run)) throw new Error("BACKUP_RUN_INVALID");
  const manifest = manifestSchema.parse(verifyBackupManifest(value, master));
  const prefix = recoveryPrefix + run + "/";
  if (manifest.keyId !== createHash("sha256").update(master).digest("hex").slice(0, 16) || manifest.database.key !== prefix + "database.dump.enc")
    throw new Error("BACKUP_MANIFEST_INVALID");
  const ids = new Set<string>();
  for (const m of manifest.media) {
    if (
      ids.has(m.id) ||
      m.key !== `${prefix}media/${m.workspaceId}/${m.id}.enc` ||
      !m.sourceKey.startsWith(`${m.workspaceId}/`) ||
      m.sourceKey.includes("..") ||
      !/^[A-Za-z0-9/_.-]+$/.test(m.sourceKey)
    )
      throw new Error("BACKUP_MEDIA_SCOPE_INVALID");
    ids.add(m.id);
  }
  return manifest;
}

async function restoreObject(client: S3Client, bucket: string, object: BackupObject, master: Buffer, filename: string) {
  const digest = createHash("sha256");
  let bytes = 0;
  async function* checked() {
    for await (const chunk of objectBytes(client, bucket, object.key)) {
      bytes += chunk.length;
      if (bytes > object.bytes) throw new Error("BACKUP_VERIFY_FAILED");
      digest.update(chunk);
      yield chunk;
    }
    if (bytes !== object.bytes || digest.digest("hex") !== object.sha256) throw new Error("BACKUP_VERIFY_FAILED");
  }
  const file = await open(filename, "wx", 0o600);
  try {
    // No consumer receives plaintext until GCM authentication and ciphertext hash both pass.
    for await (const chunk of decryptBackup(checked(), master)) await file.writeFile(chunk);
    await file.sync();
  } finally {
    await file.close();
  }
}

/** Restores into a new private directory only; never writes to a database or the original bucket. */
export async function withVerifiedRecovery<T>(
  client: S3Client,
  bucket: string,
  run: string,
  master: Buffer,
  consume: (files: { directory: string; database: string; mediaObjects: number }) => Promise<T>
): Promise<T> {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z_[a-f0-9-]{36}$/.test(run)) throw new Error("BACKUP_RUN_INVALID");
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of objectBytes(client, bucket, `${recoveryPrefix}${run}/complete.json`)) {
    length += chunk.length;
    if (length > 32 * 1024 * 1024) throw new Error("BACKUP_MANIFEST_TOO_LARGE");
    chunks.push(Buffer.from(chunk));
  }
  const manifest = parseRecoveryManifest(JSON.parse(Buffer.concat(chunks).toString("utf8")), master, run);
  const directory = await mkdtemp(join(tmpdir(), "markos-verified-recovery-"));
  try {
    const database = join(directory, "database.dump");
    await restoreObject(client, bucket, manifest.database, master, database);
    for (const m of manifest.media) {
      const folder = join(directory, "media", m.workspaceId);
      await mkdir(folder, { recursive: true, mode: 0o700 });
      await restoreObject(client, bucket, m, master, join(folder, m.id));
    }
    return await consume({ directory, database, mediaObjects: manifest.media.length });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function recoveryClient(environment = process.env): { client: S3Client; bucket: string; master: Buffer } {
  const required = (key: string) => {
    const value = environment[key];
    if (!value) throw new Error("RECOVERY_CONFIG_MISSING");
    return value;
  };
  const endpoint = new URL(required("BACKUP_S3_ENDPOINT"));
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) throw new Error("RECOVERY_ENDPOINT_INVALID");
  return {
    client: new S3Client({
      endpoint: endpoint.href,
      region: required("BACKUP_S3_REGION"),
      credentials: { accessKeyId: required("BACKUP_S3_ACCESS_KEY_ID"), secretAccessKey: required("BACKUP_S3_SECRET_ACCESS_KEY") }
    }),
    bucket: required("BACKUP_S3_BUCKET"),
    master: backupMasterKey(required("BACKUP_ENCRYPTION_KEY"))
  };
}
