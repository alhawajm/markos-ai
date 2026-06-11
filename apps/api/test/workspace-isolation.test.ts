import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

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
