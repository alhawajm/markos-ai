import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationsDirectory = new URL("../prisma/migrations/", import.meta.url);
const baseline = readFileSync(new URL("../prisma/migrations/20260802000000_clean_baseline/migration.sql", import.meta.url), "utf8");
const usageCounterBigintMigration = readFileSync(
  new URL("../prisma/migrations/20260820000000_expand_usage_counters_to_bigint/migration.sql", import.meta.url),
  "utf8"
);
const plannedAtMigration = readFileSync(new URL("../prisma/migrations/20260825000000_add_content_planned_at/migration.sql", import.meta.url), "utf8");
const onboardingSkippedModulesMigration = readFileSync(
  new URL("../prisma/migrations/20260830000000_add_onboarding_skipped_modules/migration.sql", import.meta.url),
  "utf8"
);
const onboardingDocumentAnalysisMigration = readFileSync(
  new URL("../prisma/migrations/20260901000000_add_onboarding_document_analysis/migration.sql", import.meta.url),
  "utf8"
);
const campaignDomainMigration = readFileSync(new URL("../prisma/migrations/20260901160000_reset_campaign_domain/migration.sql", import.meta.url), "utf8");
const campaignSuggestionDraftMigration = readFileSync(
  new URL("../prisma/migrations/20260901170000_add_campaign_suggestion_drafts/migration.sql", import.meta.url),
  "utf8"
);
const campaignPlanLimitMigration = readFileSync(
  new URL("../prisma/migrations/20260901180000_backfill_campaign_plan_limits/migration.sql", import.meta.url),
  "utf8"
);
const seed = readFileSync(new URL("../prisma/seed.ts", import.meta.url), "utf8");

describe("clean database baseline contract", () => {
  it("contains the clean baseline and ordered follow-up migrations", () => {
    const migrationDirectories = readdirSync(migrationsDirectory, {
      withFileTypes: true
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(migrationDirectories).toEqual([
      "20260802000000_clean_baseline",
      "20260820000000_expand_usage_counters_to_bigint",
      "20260825000000_add_content_planned_at",
      "20260830000000_add_onboarding_skipped_modules",
      "20260831000000_add_offering_catalog",
      "20260831010000_add_offering_document_analysis",
      "20260901000000_add_onboarding_document_analysis",
      "20260901160000_reset_campaign_domain",
      "20260901170000_add_campaign_suggestion_drafts",
      "20260901180000_backfill_campaign_plan_limits"
    ]);
    for (const table of ["users", "workspaces", "plans", "oauth_state_nonces", "instagram_connection_credentials", "instagram_recent_media"]) {
      expect(baseline).toContain(`CREATE TABLE "${table}"`);
    }
    expect(baseline).toContain("USING hnsw");
    expect(baseline).toContain("ENABLE ROW LEVEL SECURITY");
    expect(usageCounterBigintMigration).toContain('ALTER TABLE "usage_counters"');
    expect(usageCounterBigintMigration).toContain('ALTER COLUMN "used" TYPE BIGINT');
    expect(usageCounterBigintMigration).toContain('ALTER COLUMN "limit" TYPE BIGINT');
    expect(plannedAtMigration).toContain('ADD COLUMN "plannedAt" TIMESTAMP(3)');
    expect(plannedAtMigration).toContain('CREATE INDEX "content_items_workspaceId_plannedAt_idx"');
    expect(onboardingSkippedModulesMigration).toContain('ADD COLUMN "onboardingSkippedModules" TEXT[]');
    expect(onboardingDocumentAnalysisMigration).toContain('CREATE TABLE "onboarding_document_analyses"');
    expect(onboardingDocumentAnalysisMigration).toContain('CREATE TABLE "onboarding_document_files"');
    expect(campaignDomainMigration).toContain('CREATE TABLE "campaigns"');
    expect(campaignDomainMigration).toContain('"publishesPerDay" INTEGER NOT NULL');
    expect(campaignDomainMigration).toContain('ADD CONSTRAINT "content_items_campaignId_fkey"');
    expect(campaignSuggestionDraftMigration).toContain('ADD COLUMN "brief" TEXT');
    expect(campaignSuggestionDraftMigration).toContain('CREATE UNIQUE INDEX "content_items_campaign_suggestion_key"');
    expect(campaignPlanLimitMigration).toContain("\"limits\" - 'strategies'");
    expect(campaignPlanLimitMigration).toContain("'{campaigns}'");
    expect(campaignPlanLimitMigration).toContain("COALESCE(\"limits\" -> 'campaigns', \"limits\" -> 'strategies')");
  });

  it("seeds only the runtime plan catalog through idempotent upserts", () => {
    expect(seed).toContain("prisma.plan.upsert");
    expect(seed).not.toMatch(/prisma\.(user|workspace|contentItem|instagramConnectionCredential)\./);
    expect(seed.match(/code: "(STARTER|GROWTH|PREMIUM|ENTERPRISE)"/g)).toHaveLength(4);
  });
});
