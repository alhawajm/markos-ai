GRANT USAGE ON TYPE "InstagramConnectionStatus" TO markos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "instagram_connection_credentials", "instagram_recent_media", "oauth_state_nonces" TO markos_app;

DROP POLICY IF EXISTS "instagram_connection_credentials_workspace_rls" ON "instagram_connection_credentials";
CREATE POLICY "instagram_connection_credentials_workspace_rls" ON "instagram_connection_credentials"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());

DROP POLICY IF EXISTS "oauth_state_nonces_workspace_rls" ON "oauth_state_nonces";
CREATE POLICY "oauth_state_nonces_workspace_rls" ON "oauth_state_nonces"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());

DROP POLICY IF EXISTS "instagram_recent_media_workspace_rls" ON "instagram_recent_media";
CREATE POLICY "instagram_recent_media_workspace_rls" ON "instagram_recent_media"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());
