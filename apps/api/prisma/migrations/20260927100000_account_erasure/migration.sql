CREATE TABLE "workspace_erasure_jobs" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(), "workspaceId" UUID NOT NULL, "userId" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leaseUntil" TIMESTAMP(3), "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_erasure_jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "workspace_erasure_jobs_workspaceId_key" ON "workspace_erasure_jobs"("workspaceId");
CREATE INDEX "workspace_erasure_jobs_status_availableAt_idx" ON "workspace_erasure_jobs"("status", "availableAt");
