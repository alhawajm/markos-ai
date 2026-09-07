DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['content_conversations', 'conversation_runs', 'conversation_messages'] LOOP
    EXECUTE format('DROP POLICY workspace_isolation ON %I', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO markos_app USING ("workspaceId" = app_current_workspace_id()) WITH CHECK ("workspaceId" = app_current_workspace_id())', t || '_workspace_rls', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO markos_app', t);
  END LOOP;
END $$;

-- Prevent a scoped child row from referencing another workspace's parent, even
-- when inserted directly through the restricted application database role.
CREATE FUNCTION check_conversation_workspace() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_workspace UUID;
BEGIN
  IF TG_TABLE_NAME = 'content_conversations' THEN
    SELECT "workspaceId" INTO parent_workspace FROM content_items WHERE id = NEW."contentItemId";
  ELSE
    SELECT "workspaceId" INTO parent_workspace FROM content_conversations WHERE id = NEW."conversationId";
  END IF;
  IF parent_workspace IS DISTINCT FROM NEW."workspaceId" THEN
    RAISE EXCEPTION 'Conversation workspace mismatch' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'conversation_messages' THEN
    IF NOT EXISTS (SELECT 1 FROM conversation_runs WHERE id = NEW."runId" AND "workspaceId" = NEW."workspaceId" AND "conversationId" = NEW."conversationId") THEN
      RAISE EXCEPTION 'Conversation run mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER conversation_workspace_check BEFORE INSERT OR UPDATE ON content_conversations FOR EACH ROW EXECUTE FUNCTION check_conversation_workspace();
CREATE TRIGGER run_workspace_check BEFORE INSERT OR UPDATE ON conversation_runs FOR EACH ROW EXECUTE FUNCTION check_conversation_workspace();
CREATE TRIGGER message_workspace_check BEFORE INSERT OR UPDATE ON conversation_messages FOR EACH ROW EXECUTE FUNCTION check_conversation_workspace();
