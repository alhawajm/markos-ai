-- CreateEnum
CREATE TYPE "VaultWebsiteIngestJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "vault_website_ingest_jobs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "maxPages" INTEGER NOT NULL DEFAULT 5,
    "status" "VaultWebsiteIngestJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "draftId" UUID,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vault_website_ingest_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vault_website_ingest_jobs_status_nextRunAt_idx"
  ON "vault_website_ingest_jobs"("status", "nextRunAt");

CREATE INDEX "vault_website_ingest_jobs_workspaceId_status_idx"
  ON "vault_website_ingest_jobs"("workspaceId", "status");

GRANT USAGE ON TYPE "VaultWebsiteIngestJobStatus" TO markos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "vault_website_ingest_jobs" TO markos_app;

ALTER TABLE "vault_website_ingest_jobs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vault_website_ingest_jobs_workspace_rls" ON "vault_website_ingest_jobs"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());
