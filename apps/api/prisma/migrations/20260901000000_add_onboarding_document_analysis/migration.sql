CREATE TABLE "onboarding_document_analyses" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "status" "OfferingDocumentAnalysisStatus" NOT NULL DEFAULT 'PROCESSING',
    "result" JSONB,
    "failureCode" TEXT,
    "interactionId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "discardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_document_analyses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "onboarding_document_files" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" VARCHAR(64) NOT NULL,
    "storageKey" TEXT,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_document_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "onboarding_document_analyses_workspaceId_status_createdAt_idx"
  ON "onboarding_document_analyses"("workspaceId", "status", "createdAt");
CREATE UNIQUE INDEX "onboarding_document_analyses_workspaceId_active_key"
  ON "onboarding_document_analyses"("workspaceId")
  WHERE "status" IN ('PROCESSING', 'READY', 'FAILED');
CREATE INDEX "onboarding_document_analyses_status_expiresAt_idx"
  ON "onboarding_document_analyses"("status", "expiresAt");
CREATE INDEX "onboarding_document_files_workspaceId_analysisId_idx"
  ON "onboarding_document_files"("workspaceId", "analysisId");

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "onboarding_document_analyses", "onboarding_document_files" TO markos_app;

ALTER TABLE "onboarding_document_analyses" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "onboarding_document_analyses_workspace_rls" ON "onboarding_document_analyses" FOR ALL TO markos_app
  USING ("workspaceId" = NULLIF(current_setting('app.current_workspace', true), '')::uuid)
  WITH CHECK ("workspaceId" = NULLIF(current_setting('app.current_workspace', true), '')::uuid);

ALTER TABLE "onboarding_document_files" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "onboarding_document_files_workspace_rls" ON "onboarding_document_files" FOR ALL TO markos_app
  USING ("workspaceId" = NULLIF(current_setting('app.current_workspace', true), '')::uuid)
  WITH CHECK ("workspaceId" = NULLIF(current_setting('app.current_workspace', true), '')::uuid);
