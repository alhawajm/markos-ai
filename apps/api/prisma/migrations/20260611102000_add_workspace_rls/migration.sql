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

GRANT USAGE ON TYPE "Locale" TO markos_app;
GRANT USAGE ON TYPE "PlanStatus" TO markos_app;
GRANT USAGE ON TYPE "OnboardingStatus" TO markos_app;
GRANT USAGE ON TYPE "VatMode" TO markos_app;
GRANT USAGE ON TYPE "Role" TO markos_app;
GRANT USAGE ON TYPE "VaultSection" TO markos_app;
GRANT USAGE ON TYPE "ContentType" TO markos_app;
GRANT USAGE ON TYPE "ContentStatus" TO markos_app;
GRANT USAGE ON TYPE "MediaType" TO markos_app;
GRANT USAGE ON TYPE "MetricType" TO markos_app;
GRANT USAGE ON TYPE "PaymentPurpose" TO markos_app;
GRANT USAGE ON TYPE "PaymentStatus" TO markos_app;
GRANT USAGE ON TYPE "SubStatus" TO markos_app;
GRANT USAGE ON TYPE "InvoiceStatus" TO markos_app;
GRANT USAGE ON TYPE "UsageMetric" TO markos_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO markos_app;

ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_vault" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "strategies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "content_calendars" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "content_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "instagram_analytics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_interactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usage_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspaces_workspace_rls" ON "workspaces"
  FOR ALL TO markos_app
  USING ("id" = app_current_workspace_id())
  WITH CHECK ("id" = app_current_workspace_id());

CREATE POLICY "workspace_members_workspace_rls" ON "workspace_members"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());

CREATE POLICY "knowledge_vault_workspace_rls" ON "knowledge_vault"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());

CREATE POLICY "strategies_workspace_rls" ON "strategies"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());

CREATE POLICY "content_calendars_workspace_rls" ON "content_calendars"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());

CREATE POLICY "campaigns_workspace_rls" ON "campaigns"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());

CREATE POLICY "content_items_workspace_rls" ON "content_items"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());

CREATE POLICY "media_assets_workspace_rls" ON "media_assets"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());

CREATE POLICY "instagram_analytics_workspace_rls" ON "instagram_analytics"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());

CREATE POLICY "ai_interactions_workspace_rls" ON "ai_interactions"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());

CREATE POLICY "subscriptions_workspace_rls" ON "subscriptions"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());

CREATE POLICY "invoices_workspace_rls" ON "invoices"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());

CREATE POLICY "payments_workspace_rls" ON "payments"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());

CREATE POLICY "usage_counters_workspace_rls" ON "usage_counters"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());

CREATE POLICY "notifications_workspace_rls" ON "notifications"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());

CREATE POLICY "audit_logs_workspace_rls" ON "audit_logs"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());
