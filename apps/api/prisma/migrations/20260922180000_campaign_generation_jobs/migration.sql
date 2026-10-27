CREATE TABLE "campaign_generation_jobs" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  "workspaceId" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "requestId" UUID NOT NULL,
  "requestHash" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "input" JSONB,
  "campaignId" UUID REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "errorCode" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "campaign_generation_jobs_status_check" CHECK ("status" IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'))
);
CREATE UNIQUE INDEX "campaign_generation_jobs_workspaceId_requestId_key" ON "campaign_generation_jobs"("workspaceId", "requestId");
CREATE INDEX "campaign_generation_jobs_workspaceId_createdAt_idx" ON "campaign_generation_jobs"("workspaceId", "createdAt");
CREATE INDEX "campaign_generation_jobs_status_createdAt_idx" ON "campaign_generation_jobs"("status", "createdAt");
ALTER TABLE "campaign_generation_jobs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_generation_jobs_workspace_rls" ON "campaign_generation_jobs"
  FOR ALL TO markos_app
  USING ("workspaceId" = current_setting('app.current_workspace', true)::uuid)
  WITH CHECK ("workspaceId" = current_setting('app.current_workspace', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "campaign_generation_jobs" TO markos_app;
