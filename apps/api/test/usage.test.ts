import { randomUUID } from "node:crypto";
import type { UsageMetric } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { recordWorkspaceMeteredUsage, reserveWorkspaceUsage, UsageQuotaExceededError } from "../src/usage/usage-service";

const billableMetrics: UsageMetric[] = ["AI_GENERATION", "AI_IMAGE", "AI_TOKENS_IN", "AI_TOKENS_OUT", "POST_PUBLISH", "CAMPAIGN", "STORAGE_BYTES"];

describe("usage quota enforcement", () => {
  it.each(billableMetrics)("enforces the active plan limit for %s", async (metric) => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    await assignOneUnitPlan(session.user.id);

    await recordWorkspaceMeteredUsage({
      amount: 1,
      metric,
      workspaceId: session.workspace.id
    });

    await expect(
      recordWorkspaceMeteredUsage({
        amount: 1,
        metric,
        workspaceId: session.workspace.id
      })
    ).rejects.toBeInstanceOf(UsageQuotaExceededError);
    await expect(
      prisma.usageCounter.findFirstOrThrow({
        where: {
          metric,
          workspaceId: session.workspace.id
        }
      })
    ).resolves.toMatchObject({
      limit: 1n,
      used: 1n
    });

    await app.close();
  });

  it("uses the same hard quota guard for reserved usage", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    await assignOneUnitPlan(session.user.id);

    await reserveWorkspaceUsage({
      metric: "POST_PUBLISH",
      workspaceId: session.workspace.id
    });

    await expect(
      reserveWorkspaceUsage({
        metric: "POST_PUBLISH",
        workspaceId: session.workspace.id
      })
    ).rejects.toBeInstanceOf(UsageQuotaExceededError);

    await app.close();
  });
});

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `usage-${randomUUID()}@markos.test`,
      password: "CorrectHorseBattery99!",
      fullName: "Usage User",
      workspaceName: `Usage Workspace ${randomUUID()}`,
      locale: "en"
    }
  });

  const session = response.json().data;

  await prisma.user.update({
    data: {
      isVerified: true
    },
    where: {
      id: session.user.id
    }
  });

  return {
    ...session,
    user: {
      ...session.user,
      isVerified: true
    }
  };
}

async function assignOneUnitPlan(userId: string): Promise<void> {
  const plan = await prisma.plan.create({
    data: {
      active: true,
      code: `TEST_LIMIT_${randomUUID()}`,
      currency: "BHD",
      limits: {
        aiGenerations: 1,
        aiImages: 1,
        aiInputTokens: 1,
        aiOutputTokens: 1,
        posts: 1,
        storageBytes: 1,
        campaigns: 1
      },
      name: "Test One Unit Plan",
      priceMinor: 1000
    }
  });

  await prisma.user.update({
    data: {
      planId: plan.id,
      planStatus: "ACTIVE",
      trialEndsAt: null
    },
    where: {
      id: userId
    }
  });
}
