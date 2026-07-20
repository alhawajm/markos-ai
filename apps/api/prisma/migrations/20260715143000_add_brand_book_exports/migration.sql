CREATE TYPE "BrandBookExportStatus" AS ENUM ('DRAFT', 'EXPORTED');

CREATE TABLE "brand_book_exports" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "BrandBookExportStatus" NOT NULL DEFAULT 'EXPORTED',
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "sourceEntryIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "missingSections" "VaultSection"[] NOT NULL DEFAULT ARRAY[]::"VaultSection"[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "exportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "brand_book_exports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "brand_book_exports_workspaceId_version_key"
    ON "brand_book_exports"("workspaceId", "version");

CREATE INDEX "brand_book_exports_workspaceId_createdAt_idx"
    ON "brand_book_exports"("workspaceId", "createdAt");

GRANT SELECT, INSERT, UPDATE, DELETE ON "brand_book_exports" TO markos_app;

ALTER TABLE "brand_book_exports" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_book_exports_workspace_rls" ON "brand_book_exports"
  FOR ALL
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());
