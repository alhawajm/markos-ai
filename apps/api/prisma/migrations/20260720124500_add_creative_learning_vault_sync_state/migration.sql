ALTER TABLE "creative_learning_exemplars"
ADD COLUMN "vaultSyncedAt" TIMESTAMP(3),
ADD COLUMN "vaultSyncError" TEXT;

CREATE INDEX "creative_learning_exemplars_workspaceId_vaultSyncedAt_idx"
ON "creative_learning_exemplars"("workspaceId", "vaultSyncedAt");
