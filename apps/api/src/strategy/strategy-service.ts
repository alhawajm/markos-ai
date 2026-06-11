import type { Prisma } from "@prisma/client";
import type { StrategyPlan, StrategyRecord } from "@markos/shared-types";
import type { GenerateStrategyInput } from "@markos/validation";
import { generateStrategyPlan } from "../ai/strategy-client";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { refundWorkspaceUsage, reserveWorkspaceUsage } from "../usage/usage-service";
import { getVaultScore, searchVaultContext } from "../vault/vault-service";

const strategyAgentName = "STRATEGIST";
const localCurrency = "BHD";

export class StrategyContextMissingError extends Error {
  constructor() {
    super("Complete at least one Vault section before generating strategy");
  }
}

export async function listStrategies(workspaceId: string): Promise<StrategyRecord[]> {
  const rows = await prisma.strategy.findMany({
    where: {
      workspaceId,
      deletedAt: null
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 20
  });

  return rows.map(toStrategyRecord);
}

export async function generateWorkspaceStrategy(
  workspaceId: string,
  input: GenerateStrategyInput
): Promise<StrategyRecord> {
  const score = await getVaultScore(workspaceId);

  if (score.entryCount === 0) {
    throw new StrategyContextMissingError();
  }

  const query = input.objective ?? "Instagram strategy content pillars Bahrain SMB";
  const context = await searchVaultContext(workspaceId, {
    query,
    topK: 8
  });
  const usagePeriodDate = new Date();
  await reserveWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usagePeriodDate });

  try {
    await reserveWorkspaceUsage({ workspaceId, metric: "STRATEGY", now: usagePeriodDate });
  } catch (error) {
    await refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usagePeriodDate });
    throw error;
  }

  try {
    const request = {
      workspaceId,
      horizonDays: input.horizonDays,
      context
    };
    const generated = await generateStrategyPlan(
      input.objective === undefined
        ? request
        : {
            ...request,
            objective: input.objective
          }
    );
    const strategy: StrategyPlan = {
      ...generated.strategy,
      retrievedContext: context
    };

    const saved = await prisma.$transaction(async (tx) => {
      const row = await tx.strategy.create({
        data: {
          workspaceId,
          title: titleForStrategy(input.horizonDays, input.objective),
          horizonDays: input.horizonDays,
          content: strategy as unknown as Prisma.InputJsonValue
        }
      });

      await tx.aiInteraction.create({
        data: {
          workspaceId,
          agent: strategyAgentName,
          promptVersion: generated.prompt_version,
          prompt: {
            ...(input.objective === undefined ? {} : { objective: input.objective }),
            horizonDays: input.horizonDays,
            retrievedContext: context
          } as unknown as Prisma.InputJsonValue,
          response: strategy as unknown as Prisma.InputJsonValue,
          tokensIn: generated.tokens_in,
          tokensOut: generated.tokens_out,
          costMinor: 0,
          currency: localCurrency,
          model: generated.model || env.LLM_PRIMARY_MODEL
        }
      });

      return row;
    });

    return toStrategyRecord(saved);
  } catch (error) {
    await Promise.all([
      refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usagePeriodDate }),
      refundWorkspaceUsage({ workspaceId, metric: "STRATEGY", now: usagePeriodDate })
    ]);
    throw error;
  }
}

function titleForStrategy(horizonDays: number, objective: string | undefined): string {
  return objective === undefined ? `${horizonDays}-day Instagram strategy` : `${horizonDays}-day strategy: ${objective}`;
}

function toStrategyRecord(row: {
  id: string;
  workspaceId: string;
  title: string;
  horizonDays: number;
  content: Prisma.JsonValue;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): StrategyRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    horizonDays: row.horizonDays,
    content: row.content as unknown as StrategyPlan,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
