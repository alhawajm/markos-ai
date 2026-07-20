-- CreateEnum
CREATE TYPE "CreativeFeedbackDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CreativeLearningSource" AS ENUM ('HUMAN_FEEDBACK', 'INSTAGRAM_PERFORMANCE', 'CAMPAIGN_REVIEW');

-- CreateEnum
CREATE TYPE "CreativePatternType" AS ENUM ('POSITIVE', 'NEGATIVE');

-- AlterTable
ALTER TABLE "generated_media_variants"
ADD COLUMN "aiInteractionId" UUID,
ADD COLUMN "qualityScores" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "performanceScore" DOUBLE PRECISION,
ADD COLUMN "lastLearnedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "creative_feedback" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "generatedMediaVariantId" UUID NOT NULL,
    "aiInteractionId" UUID,
    "decision" "CreativeFeedbackDecision" NOT NULL,
    "reasonCodes" TEXT[],
    "notes" TEXT,
    "scores" JSONB NOT NULL DEFAULT '{}',
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "creative_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_learning_exemplars" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "source" "CreativeLearningSource" NOT NULL,
    "patternType" "CreativePatternType" NOT NULL,
    "generatedMediaVariantId" UUID,
    "contentItemId" UUID,
    "campaignId" UUID,
    "aiInteractionId" UUID,
    "patternKey" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "creative_learning_exemplars_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generated_media_variants_workspaceId_aiInteractionId_idx" ON "generated_media_variants"("workspaceId", "aiInteractionId");

-- CreateIndex
CREATE INDEX "creative_feedback_workspaceId_generatedMediaVariantId_createdAt_idx" ON "creative_feedback"("workspaceId", "generatedMediaVariantId", "createdAt");

-- CreateIndex
CREATE INDEX "creative_feedback_workspaceId_aiInteractionId_idx" ON "creative_feedback"("workspaceId", "aiInteractionId");

-- CreateIndex
CREATE INDEX "creative_feedback_workspaceId_decision_createdAt_idx" ON "creative_feedback"("workspaceId", "decision", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "creative_learning_exemplars_workspaceId_patternKey_key" ON "creative_learning_exemplars"("workspaceId", "patternKey");

-- CreateIndex
CREATE INDEX "creative_learning_exemplars_workspaceId_patternType_score_idx" ON "creative_learning_exemplars"("workspaceId", "patternType", "score");

-- CreateIndex
CREATE INDEX "creative_learning_exemplars_workspaceId_source_lastObservedAt_idx" ON "creative_learning_exemplars"("workspaceId", "source", "lastObservedAt");

-- CreateIndex
CREATE INDEX "creative_learning_exemplars_workspaceId_generatedMediaVariantId_idx" ON "creative_learning_exemplars"("workspaceId", "generatedMediaVariantId");

-- CreateIndex
CREATE INDEX "creative_learning_exemplars_workspaceId_contentItemId_idx" ON "creative_learning_exemplars"("workspaceId", "contentItemId");

-- CreateIndex
CREATE INDEX "creative_learning_exemplars_workspaceId_campaignId_idx" ON "creative_learning_exemplars"("workspaceId", "campaignId");

-- Grants and RLS
GRANT USAGE ON TYPE "CreativeFeedbackDecision" TO markos_app;
GRANT USAGE ON TYPE "CreativeLearningSource" TO markos_app;
GRANT USAGE ON TYPE "CreativePatternType" TO markos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "creative_feedback" TO markos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "creative_learning_exemplars" TO markos_app;

ALTER TABLE "creative_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "creative_learning_exemplars" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creative_feedback_workspace_rls" ON "creative_feedback"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());

CREATE POLICY "creative_learning_exemplars_workspace_rls" ON "creative_learning_exemplars"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());
