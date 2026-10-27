import { createHash } from "node:crypto";
import argon2 from "argon2";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { verifyTotpCode } from "../auth/totp";
import { teamError } from "./team-service";
import { eraseWorkspaceData } from "./pdpl-service";
import { deleteStoredMedia } from "../media/storage-service";
import { verifyAccountDeletionCode } from "./account-deletion-proof";

export async function accountDeletionPreview(userId: string, tx: Prisma.TransactionClient = prisma) {
  const user = await tx.user.findFirstOrThrow({ where: { id: userId, deletedAt: null } });
  const owned = await tx.workspace.findMany({
    where: { ownerUserId: userId, deletedAt: null },
    select: { id: true, name: true, updatedAt: true },
    orderBy: { id: "asc" }
  });
  const memberships = await tx.workspaceMember.findMany({ where: { userId, deletedAt: null }, orderBy: { id: "asc" } });
  const other = await tx.workspace.findMany({
    where: { id: { in: memberships.map((m) => m.workspaceId) }, ownerUserId: { not: userId }, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { id: "asc" }
  });
  return {
    ownedWorkspaces: owned.map(({ id, name }) => ({ id, name })),
    otherWorkspaces: other,
    mfaRequired: user.mfaEnabled,
    passwordRequired: !!user.passwordHash,
    confirmationToken: createHash("sha256")
      .update(JSON.stringify({ userId, authVersion: user.authVersion, owned, memberships }))
      .digest("hex")
  };
}

export async function deleteAccount(
  userId: string,
  input: { confirmationToken: string; password?: string; totpCode?: string; challengeToken?: string; emailCode?: string }
) {
  const user = await prisma.user.findFirstOrThrow({ where: { id: userId, deletedAt: null } });
  if (user.passwordHash) {
    if (!input.password || !(await argon2.verify(user.passwordHash, input.password)))
      throw teamError("ACCOUNT_DELETE_AUTH_FAILED", "Confirm your current password", 403);
  } else verifyAccountDeletionCode(userId, user.authVersion, input.challengeToken, input.emailCode);
  if (user.mfaEnabled && (!user.mfaSecret || !input.totpCode || !verifyTotpCode(user.mfaSecret, input.totpCode)))
    throw teamError("MFA_INVALID", "Confirm your authenticator code", 403);
  const now = new Date();
  await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${userId}::uuid FOR UPDATE`;
      const preview = await accountDeletionPreview(userId, tx);
      if (preview.confirmationToken !== input.confirmationToken)
        throw teamError("ACCOUNT_DELETE_CHANGED", "Your workspaces changed. Review the deletion list again", 409);
      const ids = preview.ownedWorkspaces.map((w) => w.id);
      // Access and publishing stop in the same transaction. Durable jobs remove stored files even across deploys.
      const changed = await tx.user.updateMany({
        where: { id: userId, deletedAt: null, authVersion: user.authVersion, updatedAt: user.updatedAt },
        data: {
          deletedAt: now,
          authVersion: { increment: 1 },
          email: `deleted-${userId}@markos.invalid`,
          fullName: "Deleted user",
          passwordHash: null,
          googleId: null,
          mfaEnabled: false,
          mfaSecret: null,
          isVerified: false,
          lastLoginAt: null,
          trialEndsAt: null
        }
      });
      if (!changed.count) throw teamError("ACCOUNT_DELETE_CHANGED", "Account credentials changed. Sign in again", 409);
      await tx.workspace.updateMany({
        where: { id: { in: ids }, ownerUserId: userId },
        data: { deletedAt: now, instagramAccessToken: null, instagramTokenExpiresAt: null }
      });
      await tx.instagramConnectionCredential.deleteMany({ where: { workspaceId: { in: ids } } });
      await tx.workspaceMember.updateMany({ where: { OR: [{ userId }, { workspaceId: { in: ids } }] }, data: { deletedAt: now } });
      await tx.workspaceInvitation.deleteMany({ where: { OR: [{ workspaceId: { in: ids } }, { email: user.email }] } });
      await tx.pushDevice.deleteMany({ where: { userId } });
      await tx.pushDelivery.deleteMany({ where: { OR: [{ userId }, { workspaceId: { in: ids } }] } });
      await tx.analyticsReportDelivery.deleteMany({ where: { OR: [{ userId }, { workspaceId: { in: ids } }] } });
      await tx.notificationPreference.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.passwordResetChallenge.deleteMany({ where: { userId } });
      for (const workspaceId of ids) await tx.workspaceErasureJob.upsert({ where: { workspaceId }, update: {}, create: { workspaceId, userId } });
      await tx.auditLog.create({
        data: {
          action: "ACCOUNT_DELETION_REQUESTED",
          targetType: "User",
          targetId: userId,
          metadata: { ownedWorkspaceCount: ids.length, membershipsRemoved: preview.otherWorkspaces.length }
        }
      });
    },
    { isolationLevel: "Serializable", timeout: 30_000 }
  );
  return { deleted: true as const, cleanup: "QUEUED" as const };
}

export async function processAccountErasures(now = new Date()) {
  const jobs = await prisma.workspaceErasureJob.findMany({
    where: { availableAt: { lte: now }, OR: [{ status: "PENDING" }, { status: "PROCESSING", leaseUntil: { lt: now } }] },
    orderBy: { createdAt: "asc" },
    take: 5
  });
  let completed = 0,
    failed = 0;
  for (const job of jobs) {
    const claimed = await prisma.workspaceErasureJob.updateMany({
      where: { id: job.id, status: job.status, attempts: job.attempts },
      data: { status: "PROCESSING", attempts: { increment: 1 }, leaseUntil: new Date(now.getTime() + 5 * 60_000) }
    });
    if (!claimed.count) continue;
    try {
      const workspace = await prisma.workspace.findFirst({ where: { id: job.workspaceId, ownerUserId: job.userId, deletedAt: { not: null } } });
      if (!workspace) throw new Error("ERASURE_SCOPE_MISMATCH");
      const assets = await prisma.mediaAsset.findMany({ where: { workspaceId: job.workspaceId }, select: { s3Key: true } });
      for (const asset of assets) await deleteStoredMedia(job.workspaceId, asset.s3Key);
      await eraseWorkspaceData({ actorId: job.userId, workspaceId: job.workspaceId, includeDeleted: true });
      await purgeErasedWorkspace(job.workspaceId);
      await prisma.workspaceErasureJob.updateMany({
        where: { id: job.id, attempts: job.attempts + 1 },
        data: { status: "COMPLETE", failureCode: null, leaseUntil: null }
      });
      completed++;
    } catch {
      await prisma.workspaceErasureJob.updateMany({
        where: { id: job.id, attempts: job.attempts + 1 },
        data: {
          status: job.attempts >= 9 ? "FAILED" : "PENDING",
          failureCode: "WORKSPACE_ERASURE_FAILED",
          availableAt: new Date(now.getTime() + Math.min(3600_000, 60_000 * 2 ** job.attempts)),
          leaseUntil: null
        }
      });
      failed++;
    }
  }
  return { completed, failed };
}

async function purgeErasedWorkspace(workspaceId: string) {
  await prisma.$transaction(
    async (tx) => {
      // Remove business payloads after objects are gone. Keep a workspace tombstone and minimal security/financial audit records.
      await tx.publishAttempt.deleteMany({ where: { workspaceId } });
      await tx.publishJob.deleteMany({ where: { workspaceId } });
      await tx.campaignGenerationJob.deleteMany({ where: { workspaceId } });
      await tx.contentItem.deleteMany({ where: { workspaceId } });
      await tx.campaign.deleteMany({ where: { workspaceId } });
      await tx.contentCalendar.deleteMany({ where: { workspaceId } });
      await tx.mediaAsset.deleteMany({ where: { workspaceId } });
      await tx.offering.deleteMany({ where: { workspaceId } });
      await tx.offeringCatalog.deleteMany({ where: { workspaceId } });
      await tx.knowledgeVault.deleteMany({ where: { workspaceId } });
      await tx.instagramAnalytics.deleteMany({ where: { workspaceId } });
      await tx.aiInteraction.deleteMany({ where: { workspaceId } });
      await tx.promptTemplate.deleteMany({ where: { workspaceId } });
      await tx.notification.deleteMany({ where: { workspaceId } });
      await tx.workspaceMember.deleteMany({ where: { workspaceId } });
      await tx.auditLog.updateMany({ where: { workspaceId }, data: { actorId: null, metadata: {} } });
      await tx.workspace.update({ where: { id: workspaceId }, data: { name: "Deleted workspace", slug: `deleted-${workspaceId}`, instagramAccountId: null } });
    },
    { timeout: 30_000 }
  );
}
