import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationsDirectory = new URL("../prisma/migrations/", import.meta.url);
const baseline = readFileSync(new URL("../prisma/migrations/20260802000000_clean_baseline/migration.sql", import.meta.url), "utf8");
const seed = readFileSync(new URL("../prisma/seed.ts", import.meta.url), "utf8");

describe("clean database baseline contract", () => {
  it("contains exactly one complete migration", () => {
    const migrationDirectories = readdirSync(migrationsDirectory, {
      withFileTypes: true
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(migrationDirectories).toEqual(["20260802000000_clean_baseline"]);
    for (const table of ["users", "workspaces", "plans", "oauth_state_nonces", "instagram_connection_credentials", "instagram_recent_media"]) {
      expect(baseline).toContain(`CREATE TABLE "${table}"`);
    }
    expect(baseline).toContain("USING hnsw");
    expect(baseline).toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("seeds only the runtime plan catalog through idempotent upserts", () => {
    expect(seed).toContain("prisma.plan.upsert");
    expect(seed).not.toMatch(/prisma\.(user|workspace|contentItem|instagramConnectionCredential)\./);
    expect(seed.match(/code: "(STARTER|GROWTH|PREMIUM|ENTERPRISE)"/g)).toHaveLength(4);
  });
});
