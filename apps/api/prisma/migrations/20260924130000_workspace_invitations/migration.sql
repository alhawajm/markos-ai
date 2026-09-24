CREATE TABLE "workspace_invitations" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v7(), "workspaceId" UUID NOT NULL REFERENCES workspaces(id),
  "createdBy" UUID NOT NULL REFERENCES users(id), "email" TEXT NOT NULL, "role" "Role" NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE, "expiresAt" TIMESTAMP(3) NOT NULL, "acceptedAt" TIMESTAMP(3),
  "acceptedBy" UUID REFERENCES users(id), "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_invitation_role_check" CHECK (role IN ('WORKSPACE_ADMIN','EDITOR','VIEWER'))
);
CREATE INDEX "workspace_invitations_workspaceId_expiresAt_idx" ON "workspace_invitations"("workspaceId", "expiresAt");
