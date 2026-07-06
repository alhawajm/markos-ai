ALTER TABLE "prompt_templates" ADD COLUMN "workspaceId" UUID;

UPDATE "prompt_templates" prompt
SET "workspaceId" = workspace.id
FROM "workspaces" workspace
WHERE prompt."workspaceId" IS NULL
  AND workspace."deletedAt" IS NULL
  AND workspace.id = (
    SELECT id
    FROM "workspaces"
    WHERE "deletedAt" IS NULL
    ORDER BY "createdAt" ASC
    LIMIT 1
  );

DELETE FROM "prompt_templates" WHERE "workspaceId" IS NULL;

ALTER TABLE "prompt_templates" ALTER COLUMN "workspaceId" SET NOT NULL;

DROP INDEX "prompt_templates_agent_active_idx";
DROP INDEX "prompt_templates_agent_version_key";

CREATE INDEX "prompt_templates_workspaceId_agent_active_idx" ON "prompt_templates"("workspaceId", "agent", "active");
CREATE UNIQUE INDEX "prompt_templates_workspaceId_agent_version_key" ON "prompt_templates"("workspaceId", "agent", "version");
