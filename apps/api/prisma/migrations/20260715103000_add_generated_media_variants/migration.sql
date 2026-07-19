-- CreateEnum
CREATE TYPE "VisualMode" AS ENUM ('PRODUCT_PHOTO', 'LIFESTYLE_STORY', 'AD_CREATIVE', 'BACKGROUND_VARIANT');

-- CreateEnum
CREATE TYPE "GeneratedMediaStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GeneratedMediaQualityStatus" AS ENUM ('REVIEW_REQUIRED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "generated_media_variants" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "contentItemId" UUID,
    "productId" UUID,
    "offerId" UUID,
    "sourceMediaAssetIds" UUID[],
    "visualMode" "VisualMode" NOT NULL,
    "aspectRatio" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" "GeneratedMediaStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "qualityStatus" "GeneratedMediaQualityStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "rejectionReason" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "generated_media_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generated_media_variants_workspaceId_status_idx" ON "generated_media_variants"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "generated_media_variants_workspaceId_mediaAssetId_idx" ON "generated_media_variants"("workspaceId", "mediaAssetId");

-- CreateIndex
CREATE INDEX "generated_media_variants_workspaceId_contentItemId_idx" ON "generated_media_variants"("workspaceId", "contentItemId");

-- CreateIndex
CREATE INDEX "generated_media_variants_workspaceId_productId_idx" ON "generated_media_variants"("workspaceId", "productId");

-- CreateIndex
CREATE INDEX "generated_media_variants_workspaceId_offerId_idx" ON "generated_media_variants"("workspaceId", "offerId");

-- Grants and RLS
GRANT USAGE ON TYPE "VisualMode" TO markos_app;
GRANT USAGE ON TYPE "GeneratedMediaStatus" TO markos_app;
GRANT USAGE ON TYPE "GeneratedMediaQualityStatus" TO markos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "generated_media_variants" TO markos_app;

ALTER TABLE "generated_media_variants" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "generated_media_variants_workspace_rls" ON "generated_media_variants"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());
