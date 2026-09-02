ALTER TABLE "content_items"
ADD COLUMN "brief" TEXT,
ADD COLUMN "campaignGoal" TEXT,
ADD COLUMN "campaignWeek" INTEGER,
ADD COLUMN "campaignActionIndex" INTEGER;

CREATE UNIQUE INDEX "content_items_campaign_suggestion_key"
ON "content_items"("campaignId", "campaignWeek", "campaignActionIndex");
