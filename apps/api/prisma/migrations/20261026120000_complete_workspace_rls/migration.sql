-- Workspace isolation for delivery and account-lifecycle tables.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'workspace_invitations', 'notification_preferences', 'push_deliveries',
    'analytics_report_deliveries', 'workspace_erasure_jobs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO markos_app USING ("workspaceId" = NULLIF(current_setting(''app.current_workspace'', true), '''')::uuid) WITH CHECK ("workspaceId" = NULLIF(current_setting(''app.current_workspace'', true), '''')::uuid)',
      table_name || '_workspace_rls', table_name
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO markos_app', table_name);
  END LOOP;
END $$;
