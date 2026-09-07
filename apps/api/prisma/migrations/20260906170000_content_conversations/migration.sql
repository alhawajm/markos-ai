ALTER TABLE "content_items" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "visualDirection" TEXT;

-- All writers, including media and publishing workers, invalidate stale AI input.
CREATE FUNCTION bump_content_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."revision" := OLD."revision" + 1;
  RETURN NEW;
END;
$$;
CREATE TRIGGER content_revision_before_update BEFORE UPDATE ON "content_items"
  FOR EACH ROW EXECUTE FUNCTION bump_content_revision();

CREATE TABLE "content_conversations" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  "workspaceId" UUID NOT NULL,
  "contentItemId" UUID NOT NULL UNIQUE REFERENCES "content_items"("id") ON DELETE CASCADE,
  "summary" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "content_conversations_workspaceId_idx" ON "content_conversations"("workspaceId");
CREATE TABLE "conversation_runs" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  "workspaceId" UUID NOT NULL,
  "conversationId" UUID NOT NULL REFERENCES "content_conversations"("id") ON DELETE CASCADE,
  "userId" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "instruction" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'en',
  "baseRevision" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "result" JSONB,
  "errorCode" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("conversationId", "requestId")
);
CREATE UNIQUE INDEX "conversation_one_active_run" ON "conversation_runs"("conversationId") WHERE "status" IN ('QUEUED', 'RUNNING');
CREATE INDEX "conversation_runs_workspaceId_idx" ON "conversation_runs"("workspaceId");
CREATE INDEX "conversation_runs_status_createdAt_idx" ON "conversation_runs"("status", "createdAt");
CREATE TABLE "conversation_messages" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  "workspaceId" UUID NOT NULL,
  "conversationId" UUID NOT NULL REFERENCES "content_conversations"("id") ON DELETE CASCADE,
  "runId" UUID NOT NULL REFERENCES "conversation_runs"("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("runId", "role")
);
CREATE INDEX "conversation_messages_workspaceId_idx" ON "conversation_messages"("workspaceId");
CREATE INDEX "conversation_messages_conversationId_createdAt_idx" ON "conversation_messages"("conversationId", "createdAt");

ALTER TABLE "ai_interactions" ADD COLUMN "conversationRunId" UUID,
  ADD COLUMN "contentItemId" UUID, ADD COLUMN "contentRevision" INTEGER;

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['content_conversations', 'conversation_runs', 'conversation_messages'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY workspace_isolation ON %I USING ("workspaceId" = current_setting(''app.current_workspace'', true)::uuid) WITH CHECK ("workspaceId" = current_setting(''app.current_workspace'', true)::uuid)', t);
  END LOOP;
END $$;
