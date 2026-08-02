import { describe } from "vitest";

type DatabaseTestEnvironment = {
  CI?: string;
  DATABASE_URL?: string;
  INSTAGRAM_DATABASE_TEST_URL?: string;
};

export function validateInstagramDatabaseTarget(
  environment: DatabaseTestEnvironment,
): boolean {
  const optIn = environment.INSTAGRAM_DATABASE_TEST_URL;
  if (!optIn) {
    if (environment.CI)
      throw new Error(
        "Instagram database integration tests require an explicit test database in CI",
      );
    return false;
  }

  const actual = parseDatabaseTarget(environment.DATABASE_URL, "actual Prisma");
  const declared = parseDatabaseTarget(optIn, "declared Instagram test");
  if (
    !isLoopback(actual.hostname) ||
    !/(?:test|spec|ci)/i.test(actual.database)
  )
    throw new Error(
      "Instagram database integration tests require a disposable loopback Prisma database",
    );
  if (databaseIdentity(actual) !== databaseIdentity(declared))
    throw new Error("Instagram database integration test targets do not match");
  return true;
}

export const describeInstagramDatabase = validateInstagramDatabaseTarget(
  process.env,
)
  ? describe
  : describe.skip;

type DatabaseTarget = {
  database: string;
  hostname: string;
  port: string;
};

function parseDatabaseTarget(
  value: string | undefined,
  label: string,
): DatabaseTarget {
  if (!value) throw new Error(`${label} database target is required`);
  try {
    const url = new URL(value);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:")
      throw new Error();
    const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (!database) throw new Error();
    return {
      database,
      hostname: url.hostname.toLowerCase(),
      port: url.port || "5432",
    };
  } catch {
    throw new Error(`${label} database target is invalid`);
  }
}

function databaseIdentity(target: DatabaseTarget): string {
  return `${normalizeLoopback(target.hostname)}:${target.port}/${target.database}`;
}

function normalizeLoopback(hostname: string): string {
  return isLoopback(hostname) ? "loopback" : hostname;
}

function isLoopback(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
}
