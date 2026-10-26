-- The earlier campaign-table replacement did not retain the application grant.
-- Existing campaign row-level security still scopes every application-role operation.
GRANT SELECT, INSERT, UPDATE, DELETE ON campaigns TO markos_app;
