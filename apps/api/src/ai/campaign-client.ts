import type { CampaignGenerationDurationDays, CampaignPlan, VaultRagChunk } from "@markos/shared-types";
import { z } from "zod";
import { resolveModelSetting } from "../admin/model-settings-service";
import { requestAi } from "./request";

const campaignPlanSchema = z
  .object({
    summary: z.string().min(1),
    durationDays: z.union([z.literal(3), z.literal(7), z.literal(14)]),
    publishesPerDay: z.number().int().min(1).max(3),
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
          days: z
            .array(
              z.object({
                day: z.number().int().min(1).max(14),
                posts: z
                  .array(
                    z.object({
                      contentType: z.enum(["POST", "CAROUSEL", "STORY", "REEL"]),
                      title: z.string().min(1),
                      description: z.string().min(1),
                      goal: z.string().min(1),
                      contentPillar: z.string().min(1)
                    })
                  )
                  .min(1)
                  .max(3)
              })
            )
            .min(1)
            .max(7)
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
  })
  .superRefine((campaign, context) => {
    const expectedWeeks = Math.ceil(campaign.durationDays / 7);
    if (campaign.weeklyCadence.length !== expectedWeeks) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "weeklyCadence must contain every campaign week", path: ["weeklyCadence"] });
    }

    const days = campaign.weeklyCadence.flatMap((week) => week.days);
    const expectedDays = Array.from({ length: campaign.durationDays }, (_, index) => index + 1);
    if (days.length !== expectedDays.length || days.some((day, index) => day.day !== expectedDays[index])) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "campaign days must be consecutive and complete", path: ["weeklyCadence"] });
    }

    if (days.some((day) => day.posts.length !== campaign.publishesPerDay)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "every campaign day must match publishesPerDay", path: ["weeklyCadence"] });
    }

    const pillarNames = new Set(campaign.pillars.map((pillar) => pillar.name));
    if (days.some((day) => day.posts.some((post) => !pillarNames.has(post.contentPillar)))) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "every post must reference a generated content pillar", path: ["weeklyCadence"] });
    }
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
  durationDays: CampaignGenerationDurationDays;
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
