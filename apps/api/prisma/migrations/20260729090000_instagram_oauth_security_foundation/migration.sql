CREATE TYPE "InstagramConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR');

CREATE TABLE "instagram_connection_credentials" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "workspaceId" UUID NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'INSTAGRAM',
  "providerAccountId" TEXT NOT NULL,
  "encryptedAccessToken" TEXT NOT NULL,
  "tokenIssuedAt" TIMESTAMP(3) NOT NULL,
  "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "status" "InstagramConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "requestedScopes" TEXT[] NOT NULL,
  "providerConfirmedScopes" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "instagram_connection_credentials_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "instagram_connection_credentials_workspaceId_key" ON "instagram_connection_credentials"("workspaceId");
CREATE INDEX "instagram_connection_credentials_workspaceId_status_idx" ON "instagram_connection_credentials"("workspaceId", "status");

CREATE TABLE "oauth_state_nonces" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "nonceHash" TEXT NOT NULL,
  "workspaceId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oauth_state_nonces_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "oauth_state_nonces_nonceHash_key" ON "oauth_state_nonces"("nonceHash");
CREATE INDEX "oauth_state_nonces_workspaceId_userId_idx" ON "oauth_state_nonces"("workspaceId", "userId");

ALTER TABLE "instagram_connection_credentials" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "instagram_connection_credentials_workspace_rls" ON "instagram_connection_credentials"
  USING ("workspaceId" = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspaceId" = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
ALTER TABLE "oauth_state_nonces" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oauth_state_nonces_workspace_rls" ON "oauth_state_nonces"
  USING ("workspaceId" = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspaceId" = NULLIF(current_setting('app.workspace_id', true), '')::uuid);
