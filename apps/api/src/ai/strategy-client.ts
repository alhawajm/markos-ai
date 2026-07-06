import type { StrategyPlan, VaultRagChunk } from "@markos/shared-types";
import { resolveModelSetting } from "../admin/model-settings-service";
import { env } from "../config/env";

interface StrategyGenerateResponse {
  model: string;
  prompt_version: string;
  tokens_in: number;
  tokens_out: number;
  strategy: Omit<StrategyPlan, "retrievedContext">;
}

export async function generateStrategyPlan(input: {
  workspaceId: string;
  objective?: string;
  horizonDays: number;
  context: VaultRagChunk[];
  promptTemplate?: { body: string; version: string };
}): Promise<StrategyGenerateResponse> {
  const model = await resolveModelSetting("LLM_PRIMARY_MODEL");
  const body = {
    workspace_id: input.workspaceId,
    horizon_days: input.horizonDays,
    context: input.context.map((chunk) => ({
      section: chunk.section,
      key: chunk.key,
      value: chunk.value,
      score: chunk.score
    })),
    ...(input.promptTemplate === undefined ? {} : { prompt_template: input.promptTemplate }),
    model
  };

  const requestBody = input.objective === undefined ? body : { ...body, objective: input.objective };

  const response = await fetch(new URL("/ai/strategy/generate", env.AI_BASE_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`AI strategy request failed with ${response.status}`);
  }

  return (await response.json()) as StrategyGenerateResponse;
}
