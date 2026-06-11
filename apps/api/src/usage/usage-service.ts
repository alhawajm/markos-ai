import type { PlanStatus, Prisma, UsageMetric } from "@prisma/client";
import { prisma } from "../db/prisma";

type SupportedUsageMetric = UsageMetric;

const limitKeys: Record<SupportedUsageMetric, string> = {
  AI_IMAGE: "aiImages",
  AI_GENERATION: "aiGenerations",
  POST_PUBLISH: "posts",
  STORAGE_BYTES: "storageBytes",
  STRATEGY: "strategies"
};

const monthlyUsageMetrics: SupportedUsageMetric[] = ["AI_GENERATION", "AI_IMAGE", "POST_PUBLISH", "STRATEGY"];

export class UsageQuotaExceededError extends Error {
  readonly metric: SupportedUsageMetric;

  constructor(metric: SupportedUsageMetric) {
    super(`${metric} quota exceeded`);
    this.metric = metric;
  }
}

export class UsagePlanInactiveError extends Error {
  readonly status: PlanStatus;

  constructor(status: PlanStatus) {
    super(`Billing status ${status} cannot reserve usage`);
    this.status = status;
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
  const period = usagePeriod(input.metric, now);
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

  const period = usagePeriod(input.metric, input.now ?? new Date());

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

export interface UsagePeriodResetResult {
  countersEnsured: number;
  periodEnd: string;
  periodStart: string;
  workspacesChecked: number;
}

export async function ensureCurrentUsagePeriods(input: { now?: Date } = {}): Promise<UsagePeriodResetResult> {
  const now = input.now ?? new Date();
  const period = monthPeriod(now);
  const owners = await prisma.user.findMany({
    select: {
      id: true,
      planId: true,
      planStatus: true,
      trialEndsAt: true
    },
    where: {
      deletedAt: null,
      planId: {
        not: null
      },
      OR: [
        {
          planStatus: "ACTIVE"
        },
        {
          planStatus: "TRIAL",
          OR: [
            {
              trialEndsAt: null
            },
            {
              trialEndsAt: {
                gt: now
              }
            }
          ]
        }
      ]
    }
  });
  const ownerById = new Map(owners.map((owner) => [owner.id, owner]));
  const workspaces = await prisma.workspace.findMany({
    select: {
      id: true,
      ownerUserId: true
    },
    where: {
      deletedAt: null,
      ownerUserId: {
        in: owners.map((owner) => owner.id)
      }
    }
  });
  const planIds = [...new Set(owners.flatMap((owner) => (owner.planId ? [owner.planId] : [])))];
  const plans = await prisma.plan.findMany({
    select: {
      id: true,
      limits: true
    },
    where: {
      active: true,
      deletedAt: null,
      id: {
        in: planIds
      }
    }
  });
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const countersToCreate: Prisma.UsageCounterCreateManyInput[] = [];

  for (const workspace of workspaces) {
    const owner = ownerById.get(workspace.ownerUserId);
    const plan = owner?.planId ? planById.get(owner.planId) : undefined;

    if (!owner || !plan) {
      continue;
    }

    for (const metric of monthlyUsageMetrics) {
      const limit = getLimitValue(plan.limits, limitKeys[metric]);

      if (limit === undefined) {
        continue;
      }

      countersToCreate.push({
        workspaceId: workspace.id,
        metric,
        periodStart: period.start,
        periodEnd: period.end,
        limit,
        used: 0
      });
    }
  }
  const created =
    countersToCreate.length === 0
      ? { count: 0 }
      : await prisma.usageCounter.createMany({
          data: countersToCreate,
          skipDuplicates: true
        });

  return {
    countersEnsured: created.count,
    periodEnd: period.end.toISOString(),
    periodStart: period.start.toISOString(),
    workspacesChecked: workspaces.length
  };
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
      planId: true,
      planStatus: true,
      trialEndsAt: true
    },
    where: {
      deletedAt: null,
      id: workspace.ownerUserId
    }
  });

  assertUsageAllowed(owner.planStatus, owner.trialEndsAt);

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

function assertUsageAllowed(status: PlanStatus, trialEndsAt: Date | null): void {
  if (status === "ACTIVE") {
    return;
  }

  if (status === "TRIAL" && (trialEndsAt === null || trialEndsAt > new Date())) {
    return;
  }

  throw new UsagePlanInactiveError(status);
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

function storagePeriod(): { end: Date; start: Date } {
  return {
    end: new Date(Date.UTC(9999, 11, 31)),
    start: new Date(Date.UTC(1970, 0, 1))
  };
}

function usagePeriod(metric: SupportedUsageMetric, date: Date): { end: Date; start: Date } {
  return metric === "STORAGE_BYTES" ? storagePeriod() : monthPeriod(date);
}
