ALTER TABLE "instagram_connection_credentials"
  ADD COLUMN "username" TEXT,
  ADD COLUMN "accountType" TEXT,
  ADD COLUMN "profilePictureUrl" TEXT,
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3),
  ADD COLUMN "lastErrorCode" TEXT;
UPDATE "instagram_connection_credentials" SET "username" = "providerAccountId" WHERE "username" IS NULL;
ALTER TABLE "instagram_connection_credentials" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "instagram_connection_credentials_provider_providerAccountId_key" ON "instagram_connection_credentials"("provider", "providerAccountId");

CREATE TABLE "instagram_recent_media" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(), "workspaceId" UUID NOT NULL, "connectionId" UUID NOT NULL,
  "providerMediaId" TEXT NOT NULL, "mediaType" TEXT NOT NULL, "caption" TEXT, "mediaUrl" TEXT,
  "thumbnailUrl" TEXT, "permalink" TEXT, "providerTimestamp" TIMESTAMP(3), "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instagram_recent_media_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "instagram_recent_media_connectionId_providerMediaId_key" ON "instagram_recent_media"("connectionId", "providerMediaId");
CREATE INDEX "instagram_recent_media_workspaceId_connectionId_idx" ON "instagram_recent_media"("workspaceId", "connectionId");
ALTER TABLE "instagram_recent_media" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instagram_recent_media_workspace_rls" ON "instagram_recent_media"
  USING ("workspaceId" = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspaceId" = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
