import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Instagram migration security contract", () => {
  const migration = readFileSync(
    new URL(
      "../prisma/migrations/20260729150000_harden_instagram_rls/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  it("grants the application role access and uses the repository workspace context", () => {
    expect(migration).toContain(
      'GRANT USAGE ON TYPE "InstagramConnectionStatus" TO markos_app',
    );
    expect(migration).toContain(
      '"instagram_connection_credentials", "instagram_recent_media", "oauth_state_nonces" TO markos_app',
    );
    expect(migration.match(/app_current_workspace_id\(\)/g)).toHaveLength(6);
    expect(migration).not.toContain("app.workspace_id");
  });
});
