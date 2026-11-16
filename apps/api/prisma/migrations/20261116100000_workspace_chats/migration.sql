BEGIN;
CREATE TABLE "workspace_chats" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "legacyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_chats_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_chats_title_length" CHECK (length("title") BETWEEN 1 AND 100)
);
CREATE UNIQUE INDEX "workspace_chats_id_workspaceId_key" ON "workspace_chats"("id", "workspaceId");
CREATE UNIQUE INDEX "workspace_chats_workspaceId_userId_legacyKey_key" ON "workspace_chats"("workspaceId", "userId", "legacyKey");
CREATE INDEX "workspace_chats_workspaceId_userId_updatedAt_id_idx" ON "workspace_chats"("workspaceId", "userId", "updatedAt", "id");
ALTER TABLE "ai_interactions" ADD COLUMN "workspaceChatId" UUID;
CREATE INDEX "ai_interactions_workspaceId_workspaceChatId_createdAt_idx" ON "ai_interactions"("workspaceId", "workspaceChatId", "createdAt");
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_workspaceChatId_workspaceId_fkey" FOREIGN KEY ("workspaceChatId", "workspaceId") REFERENCES "workspace_chats"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_chats" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_chats_workspace_rls" ON "workspace_chats" FOR ALL TO markos_app
  USING ("workspaceId" = NULLIF(current_setting('app.current_workspace', true), '')::uuid)
  WITH CHECK ("workspaceId" = NULLIF(current_setting('app.current_workspace', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "workspace_chats" TO markos_app;
COMMIT;
