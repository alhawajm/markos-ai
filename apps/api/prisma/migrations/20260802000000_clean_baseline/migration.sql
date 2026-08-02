-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('EN', 'AR');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE');

-- CreateEnum
CREATE TYPE "VatMode" AS ENUM ('EXCLUSIVE', 'INCLUSIVE');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'EDITOR', 'VIEWER', 'WORKSPACE_ADMIN', 'SUPER_ADMIN', 'PRODUCT_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN', 'READONLY_ADMIN');

-- CreateEnum
CREATE TYPE "VaultSection" AS ENUM ('COMPANY', 'STORY', 'PRODUCTS', 'AUDIENCE', 'COMPETITORS', 'BRAND', 'TONE', 'OBJECTIVES');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('POST', 'CAROUSEL', 'STORY', 'REEL');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'BRAND_ASSET', 'AI_GENERATED');

-- CreateEnum
CREATE TYPE "MetricType" AS ENUM ('ACCOUNT', 'POST', 'STORY', 'REEL', 'AUDIENCE');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SubStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'PAID', 'FAILED', 'VOID');

-- CreateEnum
CREATE TYPE "UsageMetric" AS ENUM ('AI_GENERATION', 'AI_IMAGE', 'AI_TOKENS_IN', 'AI_TOKENS_OUT', 'POST_PUBLISH', 'STRATEGY', 'STORAGE_BYTES');

-- CreateEnum
CREATE TYPE "InstagramConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "fullName" TEXT NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'AR',
    "planId" UUID,
    "planStatus" "PlanStatus" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "googleId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "ownerUserId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "instagramAccountId" TEXT,
    "instagramAccessToken" TEXT,
    "instagramTokenExpiresAt" TIMESTAMP(3),
    "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "onboardingScore" INTEGER NOT NULL DEFAULT 0,
    "vatPricingMode" "VatMode" NOT NULL DEFAULT 'EXCLUSIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_connection_credentials" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'INSTAGRAM',
    "providerAccountId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "accountType" TEXT,
    "profilePictureUrl" TEXT,
    "encryptedAccessToken" TEXT NOT NULL,
    "tokenIssuedAt" TIMESTAMP(3) NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "status" "InstagramConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "requestedScopes" TEXT[],
    "providerConfirmedScopes" TEXT[],
    "lastSyncedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "instagram_connection_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_recent_media" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "providerMediaId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "caption" TEXT,
    "mediaUrl" TEXT,
    "thumbnailUrl" TEXT,
    "permalink" TEXT,
    "providerTimestamp" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instagram_recent_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_state_nonces" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "nonceHash" TEXT NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_state_nonces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_vault" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "section" "VaultSection" NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "embedding" vector(1536),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "knowledge_vault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_vault_history" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "knowledgeVaultId" UUID NOT NULL,
    "section" "VaultSection" NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_vault_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategies" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "horizonDays" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_calendars" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "plan" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "content_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "captionEn" TEXT,
    "captionAr" TEXT,
    "hashtags" TEXT[],
    "callToAction" TEXT,
    "mediaIds" UUID[],
    "carousel" JSONB,
    "reelScript" JSONB,
    "contentPillar" TEXT,
    "campaignId" UUID,
    "aiPromptUsed" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "instagramPostId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "type" "MediaType" NOT NULL,
    "filename" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "cdnUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_analytics" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "contentItemId" UUID,
    "metricType" "MetricType" NOT NULL,
    "dataDate" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "instagram_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_interactions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "agent" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "prompt" JSONB NOT NULL,
    "response" JSONB NOT NULL,
    "accepted" BOOLEAN,
    "edited" BOOLEAN,
    "regenerated" BOOLEAN,
    "tokensIn" INTEGER NOT NULL,
    "tokensOut" INTEGER NOT NULL,
    "costMinor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BHD',
    "model" TEXT NOT NULL,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ai_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BHD',
    "limits" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubStatus" NOT NULL DEFAULT 'TRIALING',
    "gateway" TEXT NOT NULL,
    "gatewayCustomerId" TEXT,
    "gatewayTokenId" TEXT,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "subscriptionId" UUID,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "netMinor" INTEGER NOT NULL,
    "vatMinor" INTEGER NOT NULL,
    "grossMinor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BHD',
    "vatRateBps" INTEGER NOT NULL DEFAULT 1000,
    "issuedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "invoiceId" UUID,
    "purpose" "PaymentPurpose" NOT NULL DEFAULT 'SUBSCRIPTION',
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "gateway" TEXT NOT NULL,
    "gatewayRef" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BHD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "metric" "UsageMetric" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "limit" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "workspaceId" UUID NOT NULL,
    "agent" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "variantOf" UUID,
    "trafficPct" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_settings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "model_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "userId" UUID NOT NULL,
    "workspaceId" UUID,
    "channel" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "actorId" UUID,
    "workspaceId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "workspaces_ownerUserId_idx" ON "workspaces"("ownerUserId");

-- CreateIndex
CREATE INDEX "workspace_members_userId_idx" ON "workspace_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspaceId_userId_role_key" ON "workspace_members"("workspaceId", "userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_connection_credentials_workspaceId_key" ON "instagram_connection_credentials"("workspaceId");

-- CreateIndex
CREATE INDEX "instagram_connection_credentials_workspaceId_status_idx" ON "instagram_connection_credentials"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_connection_credentials_provider_providerAccountId_key" ON "instagram_connection_credentials"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "instagram_recent_media_workspaceId_connectionId_idx" ON "instagram_recent_media"("workspaceId", "connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_recent_media_connectionId_providerMediaId_key" ON "instagram_recent_media"("connectionId", "providerMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_state_nonces_nonceHash_key" ON "oauth_state_nonces"("nonceHash");

-- CreateIndex
CREATE INDEX "oauth_state_nonces_workspaceId_userId_idx" ON "oauth_state_nonces"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "knowledge_vault_workspaceId_section_idx" ON "knowledge_vault"("workspaceId", "section");

-- CreateIndex
CREATE INDEX "knowledge_vault_history_workspaceId_section_key_idx" ON "knowledge_vault_history"("workspaceId", "section", "key");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_vault_history_knowledgeVaultId_version_key" ON "knowledge_vault_history"("knowledgeVaultId", "version");

-- CreateIndex
CREATE INDEX "strategies_workspaceId_idx" ON "strategies"("workspaceId");

-- CreateIndex
CREATE INDEX "content_calendars_workspaceId_month_idx" ON "content_calendars"("workspaceId", "month");

-- CreateIndex
CREATE INDEX "campaigns_workspaceId_idx" ON "campaigns"("workspaceId");

-- CreateIndex
CREATE INDEX "content_items_workspaceId_status_idx" ON "content_items"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "content_items_workspaceId_scheduledAt_idx" ON "content_items"("workspaceId", "scheduledAt");

-- CreateIndex
CREATE INDEX "media_assets_workspaceId_type_idx" ON "media_assets"("workspaceId", "type");

-- CreateIndex
CREATE INDEX "instagram_analytics_workspaceId_metricType_dataDate_idx" ON "instagram_analytics"("workspaceId", "metricType", "dataDate");

-- CreateIndex
CREATE INDEX "ai_interactions_workspaceId_agent_idx" ON "ai_interactions"("workspaceId", "agent");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "subscriptions_workspaceId_status_idx" ON "subscriptions"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "invoices_workspaceId_status_idx" ON "invoices"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "payments_workspaceId_status_idx" ON "payments"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "usage_counters_workspaceId_metric_periodStart_key" ON "usage_counters"("workspaceId", "metric", "periodStart");

-- CreateIndex
CREATE INDEX "prompt_templates_workspaceId_agent_active_idx" ON "prompt_templates"("workspaceId", "agent", "active");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_workspaceId_agent_version_key" ON "prompt_templates"("workspaceId", "agent", "version");

-- CreateIndex
CREATE UNIQUE INDEX "model_settings_key_key" ON "model_settings"("key");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "audit_logs_workspaceId_action_idx" ON "audit_logs"("workspaceId", "action");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");


-- pgvector indexes are not represented by the Prisma schema.
CREATE INDEX "knowledge_vault_embedding_hnsw_idx"
  ON "knowledge_vault" USING hnsw ("embedding" vector_cosine_ops)
  WHERE "embedding" IS NOT NULL;

-- Application-role workspace isolation. The provisioning script creates the roles
-- and uuid helper before Prisma applies this migration.
CREATE OR REPLACE FUNCTION app_current_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_workspace', true), '')::uuid;
$$;

GRANT markos_app TO markos;
GRANT USAGE ON SCHEMA public TO markos_app;
GRANT EXECUTE ON FUNCTION app_current_workspace_id() TO markos_app;
GRANT EXECUTE ON FUNCTION uuid_generate_v7() TO markos_app;
GRANT USAGE ON TYPE "Locale", "PlanStatus", "OnboardingStatus", "VatMode", "Role",
  "VaultSection", "ContentType", "ContentStatus", "MediaType", "MetricType",
  "PaymentPurpose", "PaymentStatus", "SubStatus", "InvoiceStatus", "UsageMetric",
  "InstagramConnectionStatus" TO markos_app;
-- Keep this explicit grant visible for the OAuth security contract.
GRANT USAGE ON TYPE "InstagramConnectionStatus" TO markos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO markos_app;

ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspaces_workspace_rls" ON "workspaces" FOR ALL TO markos_app
  USING ("id" = app_current_workspace_id()) WITH CHECK ("id" = app_current_workspace_id());
ALTER TABLE "workspace_members" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_workspace_rls" ON "workspace_members" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
ALTER TABLE "knowledge_vault" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_vault_workspace_rls" ON "knowledge_vault" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
ALTER TABLE "knowledge_vault_history" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge_vault_history_workspace_rls" ON "knowledge_vault_history" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
ALTER TABLE "strategies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "strategies_workspace_rls" ON "strategies" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
ALTER TABLE "content_calendars" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content_calendars_workspace_rls" ON "content_calendars" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_workspace_rls" ON "campaigns" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
ALTER TABLE "content_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content_items_workspace_rls" ON "content_items" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "media_assets_workspace_rls" ON "media_assets" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
ALTER TABLE "instagram_analytics" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instagram_analytics_workspace_rls" ON "instagram_analytics" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
ALTER TABLE "ai_interactions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_interactions_workspace_rls" ON "ai_interactions" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_workspace_rls" ON "subscriptions" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_workspace_rls" ON "invoices" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_workspace_rls" ON "payments" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
ALTER TABLE "usage_counters" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usage_counters_workspace_rls" ON "usage_counters" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
ALTER TABLE "prompt_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prompt_templates_workspace_rls" ON "prompt_templates" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_workspace_rls" ON "notifications" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_workspace_rls" ON "audit_logs" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
ALTER TABLE "instagram_connection_credentials" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instagram_connection_credentials_workspace_rls" ON "instagram_connection_credentials" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
ALTER TABLE "instagram_recent_media" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instagram_recent_media_workspace_rls" ON "instagram_recent_media" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
ALTER TABLE "oauth_state_nonces" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oauth_state_nonces_workspace_rls" ON "oauth_state_nonces" FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id());
