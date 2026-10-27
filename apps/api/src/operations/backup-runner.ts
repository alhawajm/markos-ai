import { randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import Redis from "ioredis";
import { PrismaClient, Prisma } from "@prisma/client";
import { S3Client } from "@aws-sdk/client-s3";
import { backupMasterKey, signBackupManifest } from "./backup-crypto";
import { createFailureReporter } from "../observability/failure-alerts";
import { finishBackup, objectBytes, putEncryptedBackup, recoveryPrefix, type BackupObject } from "./backup-store";
import { expireBackups } from "./backup-retention";
import { emailConfiguration } from "../email/transactional-mail";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`BACKUP_CONFIG_MISSING_${name}`);
  return value;
};
function client(prefix: string) {
  const endpoint = new URL(required(`${prefix}ENDPOINT`));
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) throw new Error("BACKUP_ENDPOINT_INVALID");
  return new S3Client({
    endpoint: endpoint.href,
    region: required(`${prefix}REGION`),
    forcePathStyle: false,
    credentials: { accessKeyId: required(`${prefix}ACCESS_KEY_ID`), secretAccessKey: required(`${prefix}SECRET_ACCESS_KEY`) }
  });
}
async function* dump(database: URL, snapshot: string): AsyncGenerator<Uint8Array> {
  if (!/^[A-Fa-f0-9-]{1,100}$/.test(snapshot)) throw new Error("BACKUP_SNAPSHOT_INVALID");
  const processHandle = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--no-password", `--snapshot=${snapshot}`], {
    env: {
      ...process.env,
      PGHOST: database.hostname,
      PGPORT: database.port || "5432",
      PGUSER: decodeURIComponent(database.username),
      PGPASSWORD: decodeURIComponent(database.password),
      PGDATABASE: decodeURIComponent(database.pathname.slice(1)),
      PGSSLMODE: database.searchParams.get("sslmode") ?? "prefer"
    },
    stdio: ["ignore", "pipe", "ignore"]
  });
  const exited = once(processHandle, "exit");
  const failed = once(processHandle, "error").then(() => {
    throw new Error("BACKUP_DUMP_FAILED");
  });
  // Install a handler before reading, so a failed executable cannot reject unobserved.
  const finished = Promise.race([exited, failed]);
  void finished.catch(() => {});
  try {
    for await (const chunk of processHandle.stdout) yield chunk as Buffer;
    const [code] = await finished;
    if (code !== 0) throw new Error("BACKUP_DUMP_FAILED");
  } finally {
    if (processHandle.exitCode === null) processHandle.kill();
  }
}
async function main() {
  const databaseUrl = required("DATABASE_URL"),
    sourceBucket = required("SOURCE_S3_BUCKET"),
    bucket = required("BACKUP_S3_BUCKET");
  if (sourceBucket === bucket && required("SOURCE_S3_ENDPOINT") === required("BACKUP_S3_ENDPOINT")) throw new Error("BACKUP_DESTINATION_MUST_BE_SEPARATE");
  const days = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);
  if (!Number.isInteger(days) || days < 7 || days > 365) throw new Error("BACKUP_RETENTION_INVALID");
  const master = backupMasterKey(required("BACKUP_ENCRYPTION_KEY"));
  const source = client("SOURCE_S3_"),
    destination = client("BACKUP_S3_");
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const started = new Date(),
    run = `${started
      .toISOString()
      .replace(/\.\d+Z$/, "Z")
      .replace(/:/g, "-")}_${randomUUID()}`,
    prefix = `${recoveryPrefix}${run}/`;
  try {
    const result = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const snapshots = await tx.$queryRaw<{ id: string }[]>`SELECT pg_export_snapshot() AS id`;
        if (!snapshots[0]) throw new Error("BACKUP_SNAPSHOT_FAILED");
        const dumpObject = await putEncryptedBackup(destination, bucket, prefix + "database.dump.enc", dump(new URL(databaseUrl), snapshots[0].id), master);
        const rows = await tx.mediaAsset.findMany({ where: { deletedAt: null }, select: { id: true, workspaceId: true, s3Key: true } });
        const media: (BackupObject & { id: string; workspaceId: string; sourceKey: string })[] = [];
        for (const row of rows) {
          if (!row.s3Key.startsWith(`s3:${row.workspaceId}/`) || row.s3Key.includes("..")) throw new Error("BACKUP_MEDIA_SCOPE_INVALID");
          const object = await putEncryptedBackup(
            destination,
            bucket,
            `${prefix}media/${row.workspaceId}/${row.id}.enc`,
            objectBytes(source, sourceBucket, row.s3Key.slice(3)),
            master
          );
          media.push({ ...object, id: row.id, workspaceId: row.workspaceId, sourceKey: row.s3Key.slice(3) });
        }
        return { database: dumpObject, media };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 1800000, maxWait: 30000 }
    );
    const manifest = {
      format: "markos-recovery-v1",
      createdAt: started.toISOString(),
      completedAt: new Date().toISOString(),
      keyId: createHash("sha256").update(master).digest("hex").slice(0, 16),
      ...result
    };
    await finishBackup(destination, bucket, prefix + "complete.json", { ...manifest, signature: signBackupManifest(manifest, master) });
    try {
      await db.auditLog.create({
        data: {
          action: "BACKUP_COMPLETED",
          targetType: "Operations",
          targetId: run,
          metadata: { completedAt: manifest.completedAt, mediaObjects: result.media.length }
        }
      });
    } catch {
      console.warn("BACKUP_FRESHNESS_DATABASE_UNAVAILABLE");
    }
    if (process.env.REDIS_URL) {
      const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 5000, commandTimeout: 5000, retryStrategy: null });
      redis.on("error", () => {});
      try {
        await redis.set(
          "markos:ops:last-backup",
          JSON.stringify({ completedAt: manifest.completedAt, run, mediaObjects: result.media.length }),
          "EX",
          30 * 86400
        );
      } catch {
        console.warn("BACKUP_FRESHNESS_CACHE_UNAVAILABLE");
      } finally {
        redis.disconnect();
      }
    }
    await expireBackups(destination, bucket, days);
    console.info(
      JSON.stringify({
        status: "COMPLETE",
        run,
        mediaObjects: result.media.length,
        encryptedBytes: result.database.bytes + result.media.reduce((n, m) => n + m.bytes, 0),
        retentionDays: days
      })
    );
  } finally {
    master.fill(0);
    source.destroy();
    destination.destroy();
    await db.$disconnect();
  }
}
main().catch(async () => {
  console.error("MARKOS scheduled backup failed. Check sanitized Railway logs and the most recent complete snapshot.");
  const configuration = emailConfiguration(process.env);
  if (configuration.apiKey && configuration.from && process.env.OPS_ALERT_EMAIL) {
    const report = createFailureReporter({
      apiKey: configuration.apiKey,
      from: configuration.from,
      provider: configuration.provider,
      to: process.env.OPS_ALERT_EMAIL,
      cooldownSeconds: 900,
      claim: async () => true
    });
    await report({ service: "backup", task: "dailySnapshot", code: "BACKUP_FAILED" }).catch(() => {});
  }
  process.exitCode = 1;
});
