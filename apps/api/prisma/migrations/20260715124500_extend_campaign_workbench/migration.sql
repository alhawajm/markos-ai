CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'GENERATED', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'ARCHIVED');

ALTER TABLE "campaigns"
  ADD COLUMN "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "structuredBrief" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "package" JSONB,
  ADD COLUMN "productId" UUID,
  ADD COLUMN "offerId" UUID,
  ADD COLUMN "rationale" TEXT,
  ADD COLUMN "rejectedIdeas" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "generatedAt" TIMESTAMP(3),
  ADD COLUMN "approvedAt" TIMESTAMP(3);

CREATE INDEX "campaigns_workspaceId_status_idx" ON "campaigns"("workspaceId", "status");
CREATE INDEX "campaigns_workspaceId_startsAt_idx" ON "campaigns"("workspaceId", "startsAt");
CREATE INDEX "content_items_workspaceId_campaignId_idx" ON "content_items"("workspaceId", "campaignId");
