import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { env } from "../src/config/env";
import { encryptCredential } from "../src/security/credential-encryption";

interface WorkspaceFixture {
  userId: string;
  workspaceId: string;
  planId: string;
}

interface IsolatedRow {
  id: string;
  workspaceId: string | null;
}

interface IsolationCase {
  model: string;
  create: (fixture: WorkspaceFixture) => Promise<IsolatedRow>;
  list: (workspaceId: string) => Promise<IsolatedRow[]>;
}

const isolationCases: IsolationCase[] = [
  {
    model: "WorkspaceMember",
    create: async (fixture) =>
      prisma.workspaceMember.findFirstOrThrow({
        where: { workspaceId: fixture.workspaceId, userId: fixture.userId },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.workspaceMember.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "KnowledgeVault",
    create: (fixture) =>
      prisma.knowledgeVault.create({
        data: { workspaceId: fixture.workspaceId, section: "COMPANY", key: `company-${randomUUID()}`, value: { name: "Cafe" } },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.knowledgeVault.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "KnowledgeVaultHistory",
    create: async (fixture) => {
      const vault = await prisma.knowledgeVault.create({
        data: { workspaceId: fixture.workspaceId, section: "COMPANY", key: `history-${randomUUID()}`, value: { name: "Cafe" } },
        select: { id: true, workspaceId: true, section: true, key: true, value: true, version: true }
      });

      return prisma.knowledgeVaultHistory.create({
        data: {
          workspaceId: vault.workspaceId,
          knowledgeVaultId: vault.id,
          section: vault.section,
          key: vault.key,
          value: vault.value as Prisma.InputJsonValue,
          version: vault.version
        },
        select: { id: true, workspaceId: true }
      });
    },
    list: (workspaceId) => prisma.knowledgeVaultHistory.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "OfferingCatalog",
    create: (fixture) =>
      prisma.offeringCatalog.create({
        data: { workspaceId: fixture.workspaceId, summary: "Workspace-owned catalogue" },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.offeringCatalog.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "OfferingCatalogRevision",
    create: async (fixture) => {
      const catalog = await prisma.offeringCatalog.create({
        data: { workspaceId: fixture.workspaceId, summary: "Revision catalogue" }
      });
      return prisma.offeringCatalogRevision.create({
        data: {
          workspaceId: fixture.workspaceId,
          catalogId: catalog.id,
          version: 1,
          snapshot: { summary: catalog.summary },
          sourceType: "OWNER"
        },
        select: { id: true, workspaceId: true }
      });
    },
    list: (workspaceId) => prisma.offeringCatalogRevision.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "Offering",
    create: async (fixture) => {
      const catalog = await prisma.offeringCatalog.create({
        data: { workspaceId: fixture.workspaceId, summary: "Offering catalogue" }
      });
      return prisma.offering.create({
        data: {
          workspaceId: fixture.workspaceId,
          catalogId: catalog.id,
          name: `Offering ${randomUUID()}`,
          normalizedName: `offering-${randomUUID()}`
        },
        select: { id: true, workspaceId: true }
      });
    },
    list: (workspaceId) => prisma.offering.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "OfferingRevision",
    create: async (fixture) => {
      const catalog = await prisma.offeringCatalog.create({
        data: { workspaceId: fixture.workspaceId, summary: "Offering revision catalogue" }
      });
      const offering = await prisma.offering.create({
        data: {
          workspaceId: fixture.workspaceId,
          catalogId: catalog.id,
          name: `Revision Offering ${randomUUID()}`,
          normalizedName: `revision-offering-${randomUUID()}`
        }
      });
      return prisma.offeringRevision.create({
        data: {
          workspaceId: fixture.workspaceId,
          offeringId: offering.id,
          version: 1,
          snapshot: { name: offering.name },
          sourceType: "OWNER"
        },
        select: { id: true, workspaceId: true }
      });
    },
    list: (workspaceId) => prisma.offeringRevision.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "OfferingDocumentAnalysis",
    create: (fixture) =>
      prisma.offeringDocumentAnalysis.create({
        data: {
          workspaceId: fixture.workspaceId,
          expiresAt: new Date(Date.now() + 60_000)
        },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.offeringDocumentAnalysis.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "OfferingDocumentFile",
    create: async (fixture) => {
      const analysis = await prisma.offeringDocumentAnalysis.create({
        data: {
          workspaceId: fixture.workspaceId,
          expiresAt: new Date(Date.now() + 60_000)
        }
      });
      return prisma.offeringDocumentFile.create({
        data: {
          workspaceId: fixture.workspaceId,
          analysisId: analysis.id,
          filename: "offerings.txt",
          mimeType: "text/plain",
          sizeBytes: 12,
          checksumSha256: "a".repeat(64),
          storageKey: `local:${fixture.workspaceId}/${randomUUID()}.txt`
        },
        select: { id: true, workspaceId: true }
      });
    },
    list: (workspaceId) => prisma.offeringDocumentFile.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "OnboardingDocumentAnalysis",
    create: (fixture) =>
      prisma.onboardingDocumentAnalysis.create({
        data: {
          workspaceId: fixture.workspaceId,
          expiresAt: new Date(Date.now() + 60_000)
        },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.onboardingDocumentAnalysis.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "OnboardingDocumentFile",
    create: async (fixture) => {
      const analysis = await prisma.onboardingDocumentAnalysis.create({
        data: {
          workspaceId: fixture.workspaceId,
          expiresAt: new Date(Date.now() + 60_000)
        }
      });
      return prisma.onboardingDocumentFile.create({
        data: {
          workspaceId: fixture.workspaceId,
          analysisId: analysis.id,
          filename: "business.pdf",
          mimeType: "application/pdf",
          sizeBytes: 12,
          checksumSha256: "b".repeat(64),
          storageKey: `local:${fixture.workspaceId}/${randomUUID()}.pdf`
        },
        select: { id: true, workspaceId: true }
      });
    },
    list: (workspaceId) => prisma.onboardingDocumentFile.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "Strategy",
    create: (fixture) =>
      prisma.strategy.create({
        data: { workspaceId: fixture.workspaceId, title: `Strategy ${randomUUID()}`, horizonDays: 30, content: { pillars: [] } },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.strategy.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "ContentCalendar",
    create: (fixture) =>
      prisma.contentCalendar.create({
        data: { workspaceId: fixture.workspaceId, month: new Date("2026-01-01T00:00:00.000Z"), plan: { posts: [] } },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.contentCalendar.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "Campaign",
    create: (fixture) =>
      prisma.campaign.create({
        data: { workspaceId: fixture.workspaceId, name: `Campaign ${randomUUID()}` },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.campaign.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "ContentItem",
    create: (fixture) =>
      prisma.contentItem.create({
        data: { workspaceId: fixture.workspaceId, contentType: "POST", hashtags: [], mediaIds: [] },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.contentItem.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "MediaAsset",
    create: (fixture) =>
      prisma.mediaAsset.create({
        data: {
          workspaceId: fixture.workspaceId,
          type: "IMAGE",
          filename: `${randomUUID()}.png`,
          s3Key: `test/${randomUUID()}.png`,
          cdnUrl: "https://cdn.markos.test/test.png",
          mimeType: "image/png",
          sizeBytes: 1024
        },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.mediaAsset.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "InstagramAnalytics",
    create: (fixture) =>
      prisma.instagramAnalytics.create({
        data: {
          workspaceId: fixture.workspaceId,
          metricType: "ACCOUNT",
          dataDate: new Date("2026-01-01T00:00:00.000Z"),
          metrics: { followers: 100 },
          syncedAt: new Date()
        },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.instagramAnalytics.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "InstagramConnectionCredential",
    create: (fixture) =>
      prisma.instagramConnectionCredential.create({
        data: {
          workspaceId: fixture.workspaceId,
          providerAccountId: `account-${randomUUID()}`,
          username: `user-${randomUUID()}`,
          encryptedAccessToken: encryptCredential(`token-${randomUUID()}`, env.INSTAGRAM_TOKEN_ENCRYPTION_KEY!),
          tokenIssuedAt: new Date(),
          tokenExpiresAt: new Date(Date.now() + 86_400_000),
          status: "CONNECTED",
          requestedScopes: ["instagram_business_basic"],
          providerConfirmedScopes: []
        },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.instagramConnectionCredential.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "InstagramRecentMedia",
    create: async (fixture) => {
      const connection = await prisma.instagramConnectionCredential.create({
        data: {
          workspaceId: fixture.workspaceId,
          providerAccountId: `media-account-${randomUUID()}`,
          username: `media-user-${randomUUID()}`,
          encryptedAccessToken: encryptCredential(`token-${randomUUID()}`, env.INSTAGRAM_TOKEN_ENCRYPTION_KEY!),
          tokenIssuedAt: new Date(),
          tokenExpiresAt: new Date(Date.now() + 86_400_000),
          status: "CONNECTED",
          requestedScopes: ["instagram_business_basic"],
          providerConfirmedScopes: []
        }
      });
      return prisma.instagramRecentMedia.create({
        data: { workspaceId: fixture.workspaceId, connectionId: connection.id, providerMediaId: `media-${randomUUID()}`, mediaType: "IMAGE" },
        select: { id: true, workspaceId: true }
      });
    },
    list: (workspaceId) => prisma.instagramRecentMedia.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "OAuthStateNonce",
    create: (fixture) =>
      prisma.oAuthStateNonce.create({
        data: { nonceHash: `nonce-${randomUUID()}`, workspaceId: fixture.workspaceId, userId: fixture.userId, expiresAt: new Date(Date.now() + 60_000) },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.oAuthStateNonce.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "AiInteraction",
    create: (fixture) =>
      prisma.aiInteraction.create({
        data: {
          workspaceId: fixture.workspaceId,
          agent: "strategy",
          promptVersion: "test",
          prompt: { input: "hello" },
          response: { output: "world" },
          tokensIn: 10,
          tokensOut: 20,
          costMinor: 1,
          model: "test-model"
        },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.aiInteraction.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "PromptTemplate",
    create: (fixture) =>
      prisma.promptTemplate.create({
        data: {
          workspaceId: fixture.workspaceId,
          agent: "CONTENT",
          version: `prompt-${randomUUID()}`,
          body: "Generate a workspace-scoped test prompt body.",
          trafficPct: 100,
          active: true
        },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.promptTemplate.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "Subscription",
    create: (fixture) =>
      prisma.subscription.create({
        data: {
          userId: fixture.userId,
          workspaceId: fixture.workspaceId,
          planId: fixture.planId,
          gateway: "test",
          currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
          currentPeriodEnd: new Date("2026-02-01T00:00:00.000Z")
        },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.subscription.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "Invoice",
    create: (fixture) =>
      prisma.invoice.create({
        data: { userId: fixture.userId, workspaceId: fixture.workspaceId, netMinor: 1000, vatMinor: 100, grossMinor: 1100 },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.invoice.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "Payment",
    create: (fixture) =>
      prisma.payment.create({
        data: { workspaceId: fixture.workspaceId, gateway: "test", amountMinor: 1100 },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.payment.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "UsageCounter",
    create: (fixture) =>
      prisma.usageCounter.create({
        data: {
          workspaceId: fixture.workspaceId,
          metric: "AI_GENERATION",
          periodStart: new Date("2026-01-01T00:00:00.000Z"),
          periodEnd: new Date("2026-02-01T00:00:00.000Z"),
          limit: 100
        },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.usageCounter.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "Notification",
    create: (fixture) =>
      prisma.notification.create({
        data: {
          userId: fixture.userId,
          workspaceId: fixture.workspaceId,
          channel: "in_app",
          templateKey: "test",
          payload: { message: "hello" }
        },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.notification.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  },
  {
    model: "AuditLog",
    create: (fixture) =>
      prisma.auditLog.create({
        data: {
          actorId: fixture.userId,
          workspaceId: fixture.workspaceId,
          action: "test.created",
          targetType: "test"
        },
        select: { id: true, workspaceId: true }
      }),
    list: (workspaceId) => prisma.auditLog.findMany({ where: { workspaceId }, select: { id: true, workspaceId: true } })
  }
];

describe("workspace-owned data isolation", () => {
  it("covers every Prisma model with a workspaceId field", () => {
    const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");
    const workspaceModels = [...schema.matchAll(/model\s+(\w+)\s+\{[\s\S]*?\n\}/g)]
      .filter((match) => match[0].includes("workspaceId "))
      .map((match) => match[1])
      .sort();

    expect(isolationCases.map((entry) => entry.model).sort()).toEqual(workspaceModels);
  });

  it.each(isolationCases)("$model queries only return rows for the active workspace", async (entry) => {
    const app = await buildApp();
    const first = await createWorkspaceFixture(app, "first");
    const second = await createWorkspaceFixture(app, "second");

    const firstRow = await entry.create(first);
    const secondRow = await entry.create(second);
    const firstRows = await entry.list(first.workspaceId);
    const secondRows = await entry.list(second.workspaceId);

    expect(firstRows).toEqual(expect.arrayContaining([expect.objectContaining({ id: firstRow.id, workspaceId: first.workspaceId })]));
    expect(firstRows).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: secondRow.id })]));
    expect(firstRows.every((row) => row.workspaceId === first.workspaceId)).toBe(true);

    expect(secondRows).toEqual(expect.arrayContaining([expect.objectContaining({ id: secondRow.id, workspaceId: second.workspaceId })]));
    expect(secondRows).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: firstRow.id })]));
    expect(secondRows.every((row) => row.workspaceId === second.workspaceId)).toBe(true);

    await app.close();
  });
});

async function createWorkspaceFixture(app: FastifyInstance, label: string): Promise<WorkspaceFixture> {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `${label}-${randomUUID()}@markos.test`,
      password: "CorrectHorseBattery99!",
      fullName: `${label} User`,
      workspaceName: `${label} Workspace ${randomUUID()}`,
      locale: "en"
    }
  });
  const session = response.json().data;
  const plan = await prisma.plan.findUniqueOrThrow({
    where: { code: "STARTER" },
    select: { id: true }
  });

  return {
    userId: session.user.id,
    workspaceId: session.workspace.id,
    planId: plan.id
  };
}
