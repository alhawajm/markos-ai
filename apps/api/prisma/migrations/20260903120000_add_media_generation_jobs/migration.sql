CREATE TYPE "MediaGenerationKind" AS ENUM ('VIDEO');
CREATE TYPE "MediaGenerationStatus" AS ENUM (
  'QUEUED',
  'STARTING',
  'GENERATING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "media_generation_jobs" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "workspaceId" UUID NOT NULL,
  "contentItemId" UUID NOT NULL,
  "kind" "MediaGenerationKind" NOT NULL DEFAULT 'VIDEO',
  "status" "MediaGenerationStatus" NOT NULL DEFAULT 'QUEUED',
  "prompt" TEXT NOT NULL,
  "aspectRatio" TEXT NOT NULL DEFAULT '9:16',
  "durationSeconds" INTEGER NOT NULL DEFAULT 8,
  "provider" TEXT NOT NULL DEFAULT 'openai_sora',
  "model" TEXT,
  "providerJobId" TEXT,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "retryable" BOOLEAN,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leasedAt" TIMESTAMP(3),
  "leaseExpiresAt" TIMESTAMP(3),
  "outputMediaAssetId" UUID,
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "media_generation_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "media_generation_jobs_progress_check" CHECK ("progress" BETWEEN 0 AND 100),
  CONSTRAINT "media_generation_jobs_duration_check" CHECK ("durationSeconds" IN (4, 8, 12)),
  CONSTRAINT "media_generation_jobs_aspect_ratio_check" CHECK ("aspectRatio" = '9:16'),
  CONSTRAINT "media_generation_jobs_content_item_fkey"
    FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "media_generation_jobs_output_media_fkey"
    FOREIGN KEY ("outputMediaAssetId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "media_generation_jobs_workspaceId_createdAt_idx"
  ON "media_generation_jobs"("workspaceId", "createdAt");
CREATE INDEX "media_generation_jobs_contentItemId_createdAt_idx"
  ON "media_generation_jobs"("contentItemId", "createdAt");
CREATE INDEX "media_generation_jobs_status_nextAttemptAt_idx"
  ON "media_generation_jobs"("status", "nextAttemptAt");
CREATE UNIQUE INDEX "media_generation_jobs_active_content_key"
  ON "media_generation_jobs"("contentItemId")
  WHERE "status" IN ('QUEUED', 'STARTING', 'GENERATING', 'PROCESSING');

ALTER TABLE "media_generation_jobs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "media_generation_jobs_workspace_rls"
  ON "media_generation_jobs"
  FOR ALL TO markos_app
  USING ("workspaceId" = current_setting('app.current_workspace', true)::uuid)
  WITH CHECK ("workspaceId" = current_setting('app.current_workspace', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "media_generation_jobs" TO markos_app;
GRANT USAGE ON TYPE "MediaGenerationKind", "MediaGenerationStatus" TO markos_app;
