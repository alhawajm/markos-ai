import { describe, expect, it } from "vitest";
import { backupFreshness } from "../src/health/backup-freshness";

describe("backup freshness", () => {
  it("fails closed for missing, corrupt, future and overdue status without exposing cache data", () => {
    const now = Date.parse("2026-10-26T12:00:00Z");
    for (const status of [
      null,
      "secret invalid json",
      JSON.stringify({ completedAt: "invalid" }),
      JSON.stringify({ completedAt: "2026-10-20T00:00:00Z" }),
      JSON.stringify({ completedAt: "2026-10-28T00:00:00Z" })
    ]) {
      const result = backupFreshness(status, 36, now);
      expect(result.status).toBe("down");
      expect(JSON.stringify(result)).not.toContain("secret");
    }
    expect(backupFreshness(JSON.stringify({ completedAt: "2026-10-26T00:00:00Z" }), 36, now).status).toBe("ok");
  });
});
