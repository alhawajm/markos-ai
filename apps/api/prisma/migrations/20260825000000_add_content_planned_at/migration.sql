ALTER TABLE "content_items" ADD COLUMN "plannedAt" TIMESTAMP(3);

CREATE INDEX "content_items_workspaceId_plannedAt_idx" ON "content_items"("workspaceId", "plannedAt");
