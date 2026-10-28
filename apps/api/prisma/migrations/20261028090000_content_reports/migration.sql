BEGIN;
CREATE TYPE "ContentReportSource" AS ENUM ('CONTENT', 'ASSISTANT_MESSAGE', 'CAMPAIGN', 'GENERAL_AI');
CREATE TYPE "ContentReportReason" AS ENUM ('OFFENSIVE', 'HARMFUL', 'COPYRIGHT', 'INACCURATE', 'OTHER');
CREATE TYPE "ContentReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

CREATE TABLE "content_reports" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "workspaceId" UUID NOT NULL,
  "reportedById" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "source" "ContentReportSource" NOT NULL,
  "sourceId" UUID,
  "reason" "ContentReportReason" NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "excerpt" TEXT NOT NULL DEFAULT '',
  "mediaAssetIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "status" "ContentReportStatus" NOT NULL DEFAULT 'OPEN',
  "resolutionNote" TEXT NOT NULL DEFAULT '',
  "reviewedById" UUID,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_reports_note_length" CHECK (length("note") <= 1500 AND length("excerpt") <= 4000 AND length("resolutionNote") <= 1500)
);
CREATE UNIQUE INDEX "content_reports_workspaceId_reportedById_requestId_key" ON "content_reports"("workspaceId", "reportedById", "requestId");
CREATE INDEX "content_reports_workspaceId_createdAt_idx" ON "content_reports"("workspaceId", "createdAt");
CREATE INDEX "content_reports_status_createdAt_idx" ON "content_reports"("status", "createdAt");
ALTER TABLE "content_reports" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content_reports_workspace_rls" ON "content_reports" FOR ALL TO markos_app
  USING ("workspaceId" = NULLIF(current_setting('app.current_workspace', true), '')::uuid)
  WITH CHECK ("workspaceId" = NULLIF(current_setting('app.current_workspace', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "content_reports" TO markos_app;
COMMIT;
