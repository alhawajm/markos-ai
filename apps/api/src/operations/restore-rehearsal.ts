import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { recoveryClient, withVerifiedRecovery } from "./backup-restore";

function disposableTarget(value: string | undefined): URL {
  if (!value) throw new Error("RESTORE_POSTGRES_URL_REQUIRED");
  const target = new URL(value);
  if (
    !["postgresql:", "postgres:"].includes(target.protocol) ||
    !["localhost", "127.0.0.1", "host.docker.internal"].includes(target.hostname) ||
    !/^\/markos_restore_[a-z0-9_]{1,50}$/.test(target.pathname)
  )
    throw new Error("RESTORE_MUST_USE_LOCAL_DISPOSABLE_DATABASE");
  return target;
}
async function main() {
  const target = disposableTarget(process.env.RESTORE_POSTGRES_URL),
    name = target.pathname.slice(1);
  const adminUrl = new URL(target);
  adminUrl.pathname = "/postgres";
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.href } } });
  const { client, bucket, master } = recoveryClient();
  let created = false;
  try {
    const run = process.env.BACKUP_RUN;
    if (!run) throw new Error("BACKUP_RUN_REQUIRED");
    await withVerifiedRecovery(client, bucket, run, master, async (files) => {
      // Fails if the named database exists. Never drops or overwrites a pre-existing database.
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
      created = true;
      const child = spawn("pg_restore", ["--exit-on-error", "--no-owner", "--no-privileges", "--dbname", name, files.database], {
        env: {
          ...process.env,
          PGHOST: target.hostname,
          PGPORT: target.port || "5432",
          PGUSER: decodeURIComponent(target.username),
          PGPASSWORD: decodeURIComponent(target.password)
        },
        stdio: "ignore"
      });
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once("error", () => reject(new Error("RESTORE_CLIENT_FAILED")));
        child.once("close", resolve);
      });
      if (code !== 0) throw new Error("RESTORE_DATABASE_FAILED");
      const restored = new PrismaClient({ datasources: { db: { url: target.href } } });
      try {
        const migrations = await restored.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM _prisma_migrations`;
        const assets = await restored.mediaAsset.findMany({ where: { deletedAt: null }, select: { workspaceId: true, s3Key: true } });
        if (assets.length !== files.mediaObjects || assets.some((a) => !a.s3Key.startsWith(`s3:${a.workspaceId}/`)))
          throw new Error("RESTORE_WORKSPACE_MEDIA_CHECK_FAILED");
        const orphans = await restored.$queryRaw<
          { count: bigint }[]
        >`SELECT count(*) FROM content_media_items c JOIN media_assets m ON c."mediaAssetId" = m.id WHERE c."workspaceId" <> m."workspaceId"`;
        if (Number(orphans[0]?.count) !== 0) throw new Error("RESTORE_WORKSPACE_ISOLATION_FAILED");
        console.info(
          JSON.stringify({
            status: "RESTORED_AND_VERIFIED",
            run,
            migrations: Number(migrations[0]?.count),
            workspaces: await restored.workspace.count(),
            mediaObjects: assets.length,
            database: name,
            plaintextRetained: false
          })
        );
      } finally {
        await restored.$disconnect();
      }
    });
  } finally {
    if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.$disconnect();
    master.fill(0);
    client.destroy();
  }
}
main().catch(() => {
  console.error("MARKOS restore rehearsal failed; inspect sanitized status. No original database or media was overwritten.");
  process.exitCode = 1;
});
