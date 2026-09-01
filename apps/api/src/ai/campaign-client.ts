import type { CampaignPlan, VaultRagChunk } from "@markos/shared-types";
import { z } from "zod";
import { resolveModelSetting } from "../admin/model-settings-service";
import { requestAi } from "./request";

const campaignPlanSchema = z.object({
  summary: z.string().min(1),
  durationDays: z.union([z.literal(3), z.literal(7), z.literal(14), z.literal(30), z.literal(60), z.literal(90)]),
  publishesPerDay: z.number().int().min(1).max(5),
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

const campaignGenerateResponseSchema = z.object({
  model: z.string().min(1),
  prompt_version: z.string().min(1),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  campaign: campaignPlanSchema
});

type CampaignGenerateResponse = z.infer<typeof campaignGenerateResponseSchema>;

export async function generateCampaignPlan(input: {
  workspaceId: string;
  objective?: string;
  durationDays: CampaignPlan["durationDays"];
  publishesPerDay: number;
  startsAt: string;
  locale: "ar" | "en";
  context: VaultRagChunk[];
  promptTemplate?: { body: string; version: string };
}): Promise<CampaignGenerateResponse> {
  const model = await resolveModelSetting("LLM_LONGFORM_MODEL");
  const body = {
    workspace_id: input.workspaceId,
    duration_days: input.durationDays,
    publishes_per_day: input.publishesPerDay,
    starts_at: input.startsAt,
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

  return requestAi("/ai/campaigns/generate", {
    body: requestBody,
    parse: (value) => campaignGenerateResponseSchema.parse(value)
  });
}
