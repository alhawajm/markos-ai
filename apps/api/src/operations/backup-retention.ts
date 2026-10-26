import { DeleteObjectCommand, ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";
import { recoveryPrefix } from "./backup-store";

export function expiredRunPrefix(key: string, modified: Date, cutoff: number): string | null {
  if (!key.startsWith(recoveryPrefix) || modified.getTime() >= cutoff) return null;
  const run = key.slice(recoveryPrefix.length).split("/")[0];
  if (!run || !/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z_[a-f0-9-]{36}$/.test(run)) return null;
  const stamp = run.slice(0, 20).replace(/T(\d{2})-(\d{2})-(\d{2})Z/, "T$1:$2:$3Z");
  if (!Number.isFinite(Date.parse(stamp)) || Date.parse(stamp) >= cutoff) return null;
  return `${recoveryPrefix}${run}/`;
}

/** Call only after a newly verified snapshot. Includes abandoned runs beyond retention. */
export async function expireBackups(destination: S3Client, bucket: string, days: number): Promise<void> {
  if (!Number.isInteger(days) || days < 7 || days > 365) throw new Error("BACKUP_RETENTION_INVALID");
  const cutoff = Date.now() - days * 86400000;
  let cursor: string | undefined;
  const expired = new Set<string>(),
    recent = new Set<string>();
  do {
    const page = await destination.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: recoveryPrefix, ...(cursor ? { ContinuationToken: cursor } : {}) }));
    for (const item of page.Contents ?? []) {
      if (!item.Key || !item.LastModified) continue;
      const prefix = expiredRunPrefix(item.Key, new Date(0), cutoff);
      if (!prefix) continue;
      // A resumed run may contain a recently written object: preserve the entire run.
      if (item.LastModified.getTime() >= cutoff) recent.add(prefix);
      else expired.add(prefix);
    }
    cursor = page.NextContinuationToken;
  } while (cursor);
  for (const prefix of expired) {
    if (recent.has(prefix)) continue;
    let next: string | undefined;
    do {
      const page = await destination.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ...(next ? { ContinuationToken: next } : {}) }));
      for (const item of page.Contents ?? [])
        if (item.Key?.startsWith(prefix)) await destination.send(new DeleteObjectCommand({ Bucket: bucket, Key: item.Key }));
      next = page.NextContinuationToken;
    } while (next);
  }
}
