import type { Prisma } from "@prisma/client";
import type { AgentRunRecord } from "@markos/shared-types";
import type { RunAgentInput } from "@markos/validation";
import { getAnalyticsSummary } from "../analytics/analytics-service";
import { runAiAgent } from "../ai/agent-client";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { selectPromptTemplateForRun } from "../prompts/prompt-service";
import { recordAiTokenUsage, refundWorkspaceUsage, reserveWorkspaceUsage } from "../usage/usage-service";
import { getVaultScore, searchVaultContext } from "../vault/vault-service";

const localCurrency = "BHD";

export class AgentContextMissingError extends Error {
  constructor() {
    super("Complete at least one Vault section before running an agent");
  }
}

export async function runWorkspaceAgent(workspaceId: string, input: RunAgentInput): Promise<AgentRunRecord> {
  const score = await getVaultScore(workspaceId);

  if (score.entryCount === 0) {
    throw new AgentContextMissingError();
  }

  const context = await searchVaultContext(workspaceId, {
    query: agentRetrievalQuery(input),
    topK: 10
  });
  const agentInputs = await buildAgentInputs(workspaceId, input);
  const promptTemplate = await selectPromptTemplateForRun(
    workspaceId,
    input.agent,
    `${workspaceId}:${input.agent}:${input.task}:${input.locale}:${JSON.stringify(agentInputs ?? {})}`
  );
  const usagePeriodDate = new Date();
  await reserveWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usagePeriodDate });

  try {
    const generated = await runAiAgent({
      workspaceId,
      agent: input.agent,
      task: input.task,
      locale: input.locale,
      context,
      ...(promptTemplate === undefined ? {} : { promptTemplate: { body: promptTemplate.body, version: promptTemplate.version } }),
      ...(agentInputs === undefined ? {} : { inputs: agentInputs })
    });
    const promptVersion = promptTemplate?.version ?? generated.prompt_version;
    const prompt = {
      task: input.task,
      locale: input.locale,
      retrievedContext: context,
      ...(promptTemplate === undefined ? {} : { promptTemplate }),
      ...(agentInputs === undefined ? {} : { inputs: agentInputs })
    };

    const row = await prisma.$transaction(async (tx) => {
      const interaction = await tx.aiInteraction.create({
        data: {
          workspaceId,
          agent: input.agent,
          promptVersion,
          prompt: prompt as unknown as Prisma.InputJsonValue,
          response: {
            output: generated.output,
            providerPromptVersion: generated.prompt_version
          } as unknown as Prisma.InputJsonValue,
          tokensIn: generated.tokens_in,
          tokensOut: generated.tokens_out,
          costMinor: 0,
          currency: localCurrency,
          model: generated.model || env.LLM_PRIMARY_MODEL
        }
      });
      await recordAiTokenUsage({
        client: tx,
        workspaceId,
        tokensIn: generated.tokens_in,
        tokensOut: generated.tokens_out,
        now: usagePeriodDate
      });

      return interaction;
    });

    return {
      id: row.id,
      workspaceId: row.workspaceId,
      agent: input.agent,
      promptVersion: row.promptVersion,
      request: prompt,
      output: generated.output,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      model: row.model,
      createdAt: row.createdAt.toISOString()
    };
  } catch (error) {
    await refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usagePeriodDate });
    throw error;
  }
}

async function buildAgentInputs(workspaceId: string, input: RunAgentInput): Promise<Record<string, unknown> | undefined> {
  const inputs: Record<string, unknown> = {
    ...(input.inputs ?? {})
  };

  if (input.agent === "ANALYTICS_CONSULTANT") {
    inputs.analyticsSummary = await getAnalyticsSummary(workspaceId, { days: analyticsDays(input.inputs) });
  }

  return Object.keys(inputs).length === 0 ? undefined : inputs;
}

function analyticsDays(inputs: RunAgentInput["inputs"]): number {
  const days = inputs?.analyticsDays;

  return typeof days === "number" && Number.isFinite(days) ? Math.min(Math.max(Math.trunc(days), 1), 90) : 30;
}

function agentRetrievalQuery(input: RunAgentInput): string {
  const inputText =
    input.inputs === undefined
      ? ""
      : Object.entries(input.inputs)
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join(" ");

  return `${input.agent} ${input.task} ${input.locale} ${inputText}`.trim();
}
