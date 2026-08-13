import type { Prisma } from "@prisma/client";
import type { WorkspaceDataErasureResult, WorkspaceDataExport } from "@markos/shared-types";
import { prisma } from "../db/prisma";

export class WorkspaceDataExportNotFoundError extends Error {
  constructor() {
    super("Workspace data was not found");
  }
}

export class WorkspaceDataErasureNotFoundError extends Error {
  constructor() {
    super("Workspace data was not found");
  }
}

export async function exportWorkspaceData(workspaceId: string): Promise<WorkspaceDataExport> {
  const workspace = await prisma.workspace.findFirst({
    where: {
      deletedAt: null,
      id: workspaceId
    }
  });

  if (workspace === null) {
    throw new WorkspaceDataExportNotFoundError();
  }

  const owner = await prisma.user.findFirstOrThrow({
    where: {
      deletedAt: null,
      id: workspace.ownerUserId
    }
  });

  const [
    members,
    vault,
    vaultHistory,
    strategies,
    calendars,
    campaigns,
    contentItems,
    mediaAssets,
    analytics,
    aiInteractions,
    subscriptions,
    invoices,
    payments,
    usageCounters,
    promptTemplates,
    notifications,
    auditLogs
  ] = await Promise.all([
    prisma.workspaceMember.findMany({ where: { deletedAt: null, workspaceId } }),
    prisma.knowledgeVault.findMany({ where: { deletedAt: null, workspaceId } }),
    prisma.knowledgeVaultHistory.findMany({ where: { workspaceId } }),
    prisma.strategy.findMany({ where: { deletedAt: null, workspaceId } }),
    prisma.contentCalendar.findMany({ where: { deletedAt: null, workspaceId } }),
    prisma.campaign.findMany({ where: { deletedAt: null, workspaceId } }),
    prisma.contentItem.findMany({ where: { deletedAt: null, workspaceId } }),
    prisma.mediaAsset.findMany({ where: { deletedAt: null, workspaceId } }),
    prisma.instagramAnalytics.findMany({ where: { deletedAt: null, workspaceId } }),
    prisma.aiInteraction.findMany({ where: { deletedAt: null, workspaceId } }),
    prisma.subscription.findMany({ where: { deletedAt: null, workspaceId } }),
    prisma.invoice.findMany({ where: { deletedAt: null, workspaceId } }),
    prisma.payment.findMany({ where: { deletedAt: null, workspaceId } }),
    prisma.usageCounter.findMany({ where: { workspaceId } }),
    prisma.promptTemplate.findMany({ where: { deletedAt: null, workspaceId } }),
    prisma.notification.findMany({ where: { deletedAt: null, workspaceId } }),
    prisma.auditLog.findMany({ where: { workspaceId } })
  ]);

  return {
    exportedAt: new Date().toISOString(),
    owner: {
      createdAt: owner.createdAt.toISOString(),
      email: owner.email,
      fullName: owner.fullName,
      id: owner.id,
      isVerified: owner.isVerified,
      locale: owner.locale === "AR" ? "ar" : "en",
      planStatus: owner.planStatus,
      ...(owner.trialEndsAt === null ? {} : { trialEndsAt: owner.trialEndsAt.toISOString() }),
      updatedAt: owner.updatedAt.toISOString()
    },
    records: {
      aiInteractions: toJsonRows(aiInteractions),
      analytics: toJsonRows(analytics),
      auditLogs: toJsonRows(auditLogs),
      calendars: toJsonRows(calendars),
      campaigns: toJsonRows(campaigns),
      contentItems: toJsonRows(contentItems),
      invoices: toJsonRows(invoices),
      mediaAssets: toJsonRows(mediaAssets),
      members: toJsonRows(members),
      notifications: toJsonRows(notifications),
      payments: toJsonRows(payments),
      promptTemplates: toJsonRows(promptTemplates),
      strategies: toJsonRows(strategies),
      subscriptions: toJsonRows(subscriptions),
      usageCounters: toJsonRows(usageCounters),
      vault: toJsonRows(vault),
      vaultHistory: toJsonRows(vaultHistory)
    },
    workspace: {
      createdAt: workspace.createdAt.toISOString(),
      id: workspace.id,
      name: workspace.name,
      onboardingScore: workspace.onboardingScore,
      onboardingStatus: workspace.onboardingStatus,
      ownerUserId: workspace.ownerUserId,
      slug: workspace.slug,
      updatedAt: workspace.updatedAt.toISOString(),
      vatPricingMode: workspace.vatPricingMode
    }
  };
}

export async function eraseWorkspaceData(input: { actorId: string; workspaceId: string }): Promise<WorkspaceDataErasureResult> {
  const erasedAt = new Date();

  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.findFirst({
      where: {
        deletedAt: null,
        id: input.workspaceId
      }
    });

    if (workspace === null) {
      throw new WorkspaceDataErasureNotFoundError();
    }

    const counts: Record<string, number> = {};
    const markDeleted = {
      deletedAt: erasedAt
    };

    counts.knowledgeVault = (await tx.knowledgeVault.updateMany({ data: markDeleted, where: { deletedAt: null, workspaceId: input.workspaceId } })).count;
    counts.knowledgeVaultHistory = (await tx.knowledgeVaultHistory.deleteMany({ where: { workspaceId: input.workspaceId } })).count;
    counts.strategies = (await tx.strategy.updateMany({ data: markDeleted, where: { deletedAt: null, workspaceId: input.workspaceId } })).count;
    counts.contentCalendars = (await tx.contentCalendar.updateMany({ data: markDeleted, where: { deletedAt: null, workspaceId: input.workspaceId } })).count;
    counts.campaigns = (await tx.campaign.updateMany({ data: markDeleted, where: { deletedAt: null, workspaceId: input.workspaceId } })).count;
    counts.contentItems = (await tx.contentItem.updateMany({ data: markDeleted, where: { deletedAt: null, workspaceId: input.workspaceId } })).count;
    counts.mediaAssets = (await tx.mediaAsset.updateMany({ data: markDeleted, where: { deletedAt: null, workspaceId: input.workspaceId } })).count;
    counts.instagramAnalytics = (
      await tx.instagramAnalytics.updateMany({ data: markDeleted, where: { deletedAt: null, workspaceId: input.workspaceId } })
    ).count;
    counts.instagramRecentMedia = (await tx.instagramRecentMedia.deleteMany({ where: { workspaceId: input.workspaceId } })).count;
    counts.instagramConnectionCredentials = (await tx.instagramConnectionCredential.deleteMany({ where: { workspaceId: input.workspaceId } })).count;
    counts.oauthStateNonces = (await tx.oAuthStateNonce.deleteMany({ where: { workspaceId: input.workspaceId } })).count;
    counts.aiInteractions = (await tx.aiInteraction.updateMany({ data: markDeleted, where: { deletedAt: null, workspaceId: input.workspaceId } })).count;
    counts.subscriptions = (await tx.subscription.updateMany({ data: markDeleted, where: { deletedAt: null, workspaceId: input.workspaceId } })).count;
    counts.invoices = (await tx.invoice.updateMany({ data: markDeleted, where: { deletedAt: null, workspaceId: input.workspaceId } })).count;
    counts.payments = (await tx.payment.updateMany({ data: markDeleted, where: { deletedAt: null, workspaceId: input.workspaceId } })).count;
    counts.usageCounters = (await tx.usageCounter.deleteMany({ where: { workspaceId: input.workspaceId } })).count;
    counts.promptTemplates = (await tx.promptTemplate.updateMany({ data: markDeleted, where: { deletedAt: null, workspaceId: input.workspaceId } })).count;
    counts.notifications = (await tx.notification.updateMany({ data: markDeleted, where: { deletedAt: null, workspaceId: input.workspaceId } })).count;
    counts.workspaceMembers = (await tx.workspaceMember.updateMany({ data: markDeleted, where: { deletedAt: null, workspaceId: input.workspaceId } })).count;
    counts.workspaces = (
      await tx.workspace.updateMany({
        data: {
          deletedAt: erasedAt,
          instagramAccessToken: null,
          instagramAccountId: null,
          instagramTokenExpiresAt: null
        },
        where: {
          deletedAt: null,
          id: input.workspaceId
        }
      })
    ).count;

    const remainingMemberships = await tx.workspaceMember.count({
      where: {
        deletedAt: null,
        userId: workspace.ownerUserId
      }
    });
    const ownerAnonymized = remainingMemberships === 0;

    if (ownerAnonymized) {
      await tx.notification.updateMany({
        data: markDeleted,
        where: {
          deletedAt: null,
          userId: workspace.ownerUserId
        }
      });
      await tx.user.update({
        data: {
          deletedAt: erasedAt,
          email: `deleted-${workspace.ownerUserId}@markos.invalid`,
          fullName: "Deleted user",
          googleId: null,
          isVerified: false,
          lastLoginAt: null,
          mfaEnabled: false,
          mfaSecret: null,
          passwordHash: null,
          trialEndsAt: null
        },
        where: {
          id: workspace.ownerUserId
        }
      });
    }

    await tx.auditLog.create({
      data: {
        action: "WORKSPACE_DATA_ERASED",
        actorId: input.actorId,
        metadata: {
          counts,
          ownerAnonymized
        } as Prisma.InputJsonObject,
        targetId: input.workspaceId,
        targetType: "Workspace",
        workspaceId: input.workspaceId
      }
    });

    return {
      counts,
      erasedAt: erasedAt.toISOString(),
      ownerAnonymized,
      userId: workspace.ownerUserId,
      workspaceId: input.workspaceId
    };
  });
}

function toJsonRows(rows: unknown[]): unknown[] {
  return JSON.parse(JSON.stringify(rows)) as unknown[];
}
