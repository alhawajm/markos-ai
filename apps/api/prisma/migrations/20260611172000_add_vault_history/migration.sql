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

INSERT INTO "knowledge_vault_history" (
    "workspaceId",
    "knowledgeVaultId",
    "section",
    "key",
    "value",
    "version",
    "createdAt"
)
SELECT
    "workspaceId",
    "id",
    "section",
    "key",
    "value",
    "version",
    "updatedAt"
FROM "knowledge_vault"
WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "knowledge_vault_history_knowledgeVaultId_version_key"
    ON "knowledge_vault_history"("knowledgeVaultId", "version");

CREATE INDEX "knowledge_vault_history_workspaceId_section_key_idx"
    ON "knowledge_vault_history"("workspaceId", "section", "key");

GRANT SELECT, INSERT, UPDATE, DELETE ON "knowledge_vault_history" TO markos_app;

ALTER TABLE "knowledge_vault_history" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_vault_history_workspace_rls" ON "knowledge_vault_history"
  FOR ALL TO markos_app
  USING ("workspaceId" = app_current_workspace_id())
  WITH CHECK ("workspaceId" = app_current_workspace_id());
