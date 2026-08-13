import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Instagram migration security contract", () => {
  const migration = readFileSync(new URL("../prisma/migrations/20260802000000_clean_baseline/migration.sql", import.meta.url), "utf8");

  it("grants the application role access and uses the repository workspace context", () => {
    expect(migration).toContain('GRANT USAGE ON TYPE "InstagramConnectionStatus" TO markos_app');
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO markos_app");
    expect(migration).toContain('CREATE TABLE "oauth_state_nonces"');
    expect(migration).toContain('CREATE TABLE "instagram_connection_credentials"');
    expect(migration).toContain('CREATE TABLE "instagram_recent_media"');
    expect(migration.match(/app_current_workspace_id\(\)/g)?.length).toBeGreaterThanOrEqual(6);
    expect(migration).not.toContain("app.workspace_id");
  });
});
