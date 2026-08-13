import type { StrategyPlan, VaultRagChunk } from "@markos/shared-types";
import { z } from "zod";
import { resolveModelSetting } from "../admin/model-settings-service";
import { requestAi } from "./request";

const strategyPlanSchema = z.object({
  summary: z.string().min(1),
  horizonDays: z.number().int().min(30).max(180),
  objectives: z.array(z.string().min(1)).min(1),
  pillars: z
    .array(
      z.object({
        name: z.string().min(1),
        rationale: z.string().min(1),
        contentAngles: z.array(z.string().min(1)).min(1)
      })
    )
    .min(1),
  weeklyCadence: z
    .array(
      z.object({
        week: z.number().int().positive(),
        focus: z.string().min(1),
        actions: z.array(z.string().min(1)).min(1)
      })
    )
    .min(1),
  kpis: z
    .array(
      z.object({
        name: z.string().min(1),
        target: z.string().min(1)
      })
    )
    .min(1),
  risks: z.array(z.string().min(1)).min(1),
  nextActions: z.array(z.string().min(1)).min(1)
});

const strategyGenerateResponseSchema = z.object({
  model: z.string().min(1),
  prompt_version: z.string().min(1),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  strategy: strategyPlanSchema
});

type StrategyGenerateResponse = z.infer<typeof strategyGenerateResponseSchema>;

export async function generateStrategyPlan(input: {
  workspaceId: string;
  objective?: string;
  horizonDays: number;
  locale: "ar" | "en";
  context: VaultRagChunk[];
  promptTemplate?: { body: string; version: string };
}): Promise<StrategyGenerateResponse> {
  const model = await resolveModelSetting("LLM_LONGFORM_MODEL");
  const body = {
    workspace_id: input.workspaceId,
    horizon_days: input.horizonDays,
    locale: input.locale,
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

  return requestAi("/ai/strategy/generate", {
    body: requestBody,
    parse: (value) => strategyGenerateResponseSchema.parse(value)
  });
}
