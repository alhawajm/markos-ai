import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { hasPermissions } from "../auth/rbac";

export class CampaignGenerationError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 409
  ) {
    super(message);
  }
}

export async function assertCampaignGenerationAccess(workspaceId: string, userId: string, tx: Prisma.TransactionClient = prisma): Promise<void> {
  const [member, user, workspace] = await Promise.all([
    tx.workspaceMember.findFirst({ where: { workspaceId, userId, deletedAt: null } }),
    tx.user.findFirst({ where: { id: userId, deletedAt: null, isVerified: true } }),
    tx.workspace.findFirst({ where: { id: workspaceId, deletedAt: null } })
  ]);
  if (!member || !user || !workspace || !hasPermissions([member.role], ["campaign:generate"])) {
    throw new CampaignGenerationError("CAMPAIGN_ACCESS_CHANGED", "Your access changed. Sign in again before generating a campaign.", 403);
  }
}
