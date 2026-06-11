import type { Prisma, UsageMetric } from "@prisma/client";
import { prisma } from "../db/prisma";

type SupportedUsageMetric = Extract<UsageMetric, "AI_GENERATION" | "STRATEGY">;

const limitKeys: Record<SupportedUsageMetric, string> = {
  AI_GENERATION: "aiGenerations",
  STRATEGY: "strategies"
};

export class UsageQuotaExceededError extends Error {
  readonly metric: SupportedUsageMetric;

  constructor(metric: SupportedUsageMetric) {
    super(`${metric} quota exceeded`);
    this.metric = metric;
  }
}

export async function reserveWorkspaceUsage(input: {
  amount?: number;
  metric: SupportedUsageMetric;
  now?: Date;
  workspaceId: string;
}): Promise<void> {
  const amount = input.amount ?? 1;

  if (amount <= 0 || !Number.isInteger(amount)) {
    throw new Error("Usage amount must be a positive integer");
  }

  const now = input.now ?? new Date();
  const period = monthPeriod(now);
  const limit = await getWorkspaceLimit(input.workspaceId, input.metric);

  await prisma.$transaction(async (tx) => {
    await tx.usageCounter.upsert({
      create: {
        workspaceId: input.workspaceId,
        metric: input.metric,
        periodStart: period.start,
        periodEnd: period.end,
        limit,
        used: 0
      },
      update: {
        limit,
        periodEnd: period.end
      },
      where: {
        workspaceId_metric_periodStart: {
          workspaceId: input.workspaceId,
          metric: input.metric,
          periodStart: period.start
        }
      }
    });

    const updated = await tx.usageCounter.updateMany({
      data: {
        used: {
          increment: amount
        }
      },
      where: {
        workspaceId: input.workspaceId,
        metric: input.metric,
        periodStart: period.start,
        used: {
          lte: limit - amount
        }
      }
    });

    if (updated.count !== 1) {
      throw new UsageQuotaExceededError(input.metric);
    }
  });
}

export async function refundWorkspaceUsage(input: {
  amount?: number;
  metric: SupportedUsageMetric;
  now?: Date;
  workspaceId: string;
}): Promise<void> {
  const amount = input.amount ?? 1;

  if (amount <= 0 || !Number.isInteger(amount)) {
    return;
  }

  const period = monthPeriod(input.now ?? new Date());

  await prisma.usageCounter.updateMany({
    data: {
      used: {
        decrement: amount
      }
    },
    where: {
      workspaceId: input.workspaceId,
      metric: input.metric,
      periodStart: period.start,
      used: {
        gte: amount
      }
    }
  });
}

async function getWorkspaceLimit(workspaceId: string, metric: SupportedUsageMetric): Promise<number> {
  const workspace = await prisma.workspace.findFirstOrThrow({
    select: {
      ownerUserId: true
    },
    where: {
      deletedAt: null,
      id: workspaceId
    }
  });
  const owner = await prisma.user.findFirstOrThrow({
    select: {
      planId: true
    },
    where: {
      deletedAt: null,
      id: workspace.ownerUserId
    }
  });
  const plan = owner.planId
    ? await prisma.plan.findFirst({
        select: {
          limits: true
        },
        where: {
          active: true,
          deletedAt: null,
          id: owner.planId
        }
      })
    : null;
  const limits = plan?.limits;
  const limit = getLimitValue(limits, limitKeys[metric]);

  if (limit === undefined) {
    throw new Error(`Plan limit is missing for ${metric}`);
  }

  return limit;
}

function getLimitValue(limits: Prisma.JsonValue | undefined, key: string): number | undefined {
  if (typeof limits !== "object" || limits === null || Array.isArray(limits)) {
    return undefined;
  }

  const value = (limits as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function monthPeriod(date: Date): { end: Date; start: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));

  return {
    end,
    start
  };
}
