CREATE TYPE "PublishJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'RETRY_WAIT', 'PUBLISHED', 'FAILED', 'CANCELLED');
CREATE TYPE "PublishTrigger" AS ENUM ('SCHEDULED', 'PUBLISH_NOW');

CREATE TABLE "publish_jobs" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "workspaceId" UUID NOT NULL,
  "contentItemId" UUID NOT NULL,
  "status" "PublishJobStatus" NOT NULL DEFAULT 'QUEUED',
  "trigger" "PublishTrigger" NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leasedAt" TIMESTAMP(3),
  "leaseExpiresAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "publish_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "publish_jobs_attempts_check" CHECK ("attempts" >= 0 AND "maxAttempts" BETWEEN 1 AND 10),
  CONSTRAINT "publish_jobs_content_item_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "publish_attempts" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "workspaceId" UUID NOT NULL,
  "publishJobId" UUID NOT NULL,
  "contentItemId" UUID NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "errorCode" TEXT,
  "retryable" BOOLEAN,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "publish_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "publish_attempts_publish_job_fkey" FOREIGN KEY ("publishJobId") REFERENCES "publish_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "publish_attempts_content_item_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "publish_jobs_idempotencyKey_key" ON "publish_jobs"("idempotencyKey");
CREATE INDEX "publish_jobs_workspaceId_createdAt_idx" ON "publish_jobs"("workspaceId", "createdAt");
CREATE INDEX "publish_jobs_contentItemId_createdAt_idx" ON "publish_jobs"("contentItemId", "createdAt");
CREATE INDEX "publish_jobs_status_nextAttemptAt_idx" ON "publish_jobs"("status", "nextAttemptAt");
CREATE UNIQUE INDEX "publish_jobs_active_content_key" ON "publish_jobs"("contentItemId")
  WHERE "status" IN ('QUEUED', 'PROCESSING', 'RETRY_WAIT');
CREATE INDEX "publish_attempts_workspaceId_startedAt_idx" ON "publish_attempts"("workspaceId", "startedAt");
CREATE INDEX "publish_attempts_publishJobId_attemptNumber_idx" ON "publish_attempts"("publishJobId", "attemptNumber");

ALTER TABLE "publish_jobs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "publish_jobs_workspace_rls" ON "publish_jobs" FOR ALL TO markos_app
  USING ("workspaceId" = current_setting('app.current_workspace', true)::uuid)
  WITH CHECK ("workspaceId" = current_setting('app.current_workspace', true)::uuid);
ALTER TABLE "publish_attempts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "publish_attempts_workspace_rls" ON "publish_attempts" FOR ALL TO markos_app
  USING ("workspaceId" = current_setting('app.current_workspace', true)::uuid)
  WITH CHECK ("workspaceId" = current_setting('app.current_workspace', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "publish_jobs", "publish_attempts" TO markos_app;
GRANT USAGE ON TYPE "PublishJobStatus", "PublishTrigger" TO markos_app;
