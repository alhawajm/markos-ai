-- The generated, time-bound artifact previously called Strategy is now Campaign.
-- Existing Strategy/Campaign rows are intentionally disposable at this pre-launch stage.

ALTER TYPE "UsageMetric" RENAME VALUE 'STRATEGY' TO 'CAMPAIGN';

UPDATE "content_items" SET "campaignId" = NULL WHERE "campaignId" IS NOT NULL;

DROP TABLE "strategies";
DROP TABLE "campaigns";

CREATE TYPE "CampaignStatus" AS ENUM ('REVIEW', 'APPROVED', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

CREATE TABLE "campaigns" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'REVIEW',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "publishesPerDay" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "campaigns_durationDays_check" CHECK ("durationDays" IN (3, 7, 14, 30, 60, 90)),
    CONSTRAINT "campaigns_publishesPerDay_check" CHECK ("publishesPerDay" BETWEEN 1 AND 5),
    CONSTRAINT "campaigns_dates_check" CHECK ("endsAt" > "startsAt")
);

CREATE INDEX "campaigns_workspaceId_idx" ON "campaigns"("workspaceId");
CREATE INDEX "campaigns_workspaceId_status_idx" ON "campaigns"("workspaceId", "status");
CREATE INDEX "campaigns_workspaceId_startsAt_idx" ON "campaigns"("workspaceId", "startsAt");
CREATE INDEX "content_items_workspaceId_campaignId_idx" ON "content_items"("workspaceId", "campaignId");

ALTER TABLE "content_items"
ADD CONSTRAINT "content_items_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_workspace_rls" ON "campaigns" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
