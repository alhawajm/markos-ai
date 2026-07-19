import "../src/config/env";

import { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const directDatabaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

if (!directDatabaseUrl) {
  throw new Error("DIRECT_DATABASE_URL or DATABASE_URL is required for database deployment");
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: directDatabaseUrl
    }
  }
});

try {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION uuid_generate_v7()
    RETURNS uuid
    LANGUAGE plpgsql
    VOLATILE
    AS $$
    DECLARE
      unix_ts_ms bytea;
      rand_bytes bytea;
    BEGIN
      unix_ts_ms := substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3);
      rand_bytes := gen_random_bytes(10);
      rand_bytes := set_byte(rand_bytes, 0, (get_byte(rand_bytes, 0) & 15) | 112);
      rand_bytes := set_byte(rand_bytes, 2, (get_byte(rand_bytes, 2) & 63) | 128);

      RETURN encode(unix_ts_ms || rand_bytes, 'hex')::uuid;
    END;
    $$
  `);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'markos_app') THEN
        CREATE ROLE markos_app NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
      END IF;

      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'markos') THEN
        CREATE ROLE markos NOLOGIN;
      END IF;

      EXECUTE format('GRANT markos_app TO %I', current_user);
    END
    $$
  `);
} finally {
  await prisma.$disconnect();
}

const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const apiDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const deploymentEnvironment = {
  ...process.env,
  DATABASE_URL: directDatabaseUrl,
  MARKOS_SEED_DEMO_WORKSPACE: "false"
};

runPrisma(["migrate", "deploy"]);
runPrisma(["db", "seed"]);

function runPrisma(args: string[]): void {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: apiDirectory,
    env: deploymentEnvironment,
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Prisma ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
}
