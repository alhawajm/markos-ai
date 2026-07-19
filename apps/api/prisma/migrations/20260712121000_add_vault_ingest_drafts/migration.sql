-- CreateEnum
CREATE TYPE "VaultIngestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "vault_ingest_drafts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT,
    "sourceDescription" TEXT,
    "candidates" JSONB NOT NULL,
    "status" "VaultIngestStatus" NOT NULL DEFAULT 'PENDING',
    "confidence" DOUBLE PRECISION NOT NULL,
    "error" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vault_ingest_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vault_ingest_drafts_workspaceId_status_idx" ON "vault_ingest_drafts"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "vault_ingest_drafts_workspaceId_sourceUrl_idx" ON "vault_ingest_drafts"("workspaceId", "sourceUrl");

-- Grants and RLS
GRANT USAGE ON TYPE "VaultIngestStatus" TO markos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "vault_ingest_drafts" TO markos_app;

ALTER TABLE "vault_ingest_drafts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vault_ingest_drafts_workspace_rls" ON "vault_ingest_drafts"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());
