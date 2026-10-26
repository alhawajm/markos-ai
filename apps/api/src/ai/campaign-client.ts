import type { CampaignGenerationDurationDays, CampaignPlan, CampaignReferenceFileInput, VaultRagChunk } from "@markos/shared-types";
import { campaignGenerateResponseSchema, segmentPlanSchema, type CampaignGenerateResponse, type CampaignOutline } from "./campaign-contracts";
export type { CampaignGenerateResponse, CampaignOutline } from "./campaign-contracts";
import { resolveModelSetting } from "../admin/model-settings-service";
import { requestAi } from "./request";

export interface CampaignAiInput {
  workspaceId: string;
  objective?: string | undefined;
  description?: string | undefined;
  referenceFiles?: CampaignReferenceFileInput[] | undefined;
  durationDays: number;
  publishesPerDay: number;
  startsAt: string;
  locale: "ar" | "en";
  context: VaultRagChunk[];
  promptTemplate?: { body: string; version: string };
}
export async function generateCampaignPlan(input: CampaignAiInput & { durationDays: CampaignGenerationDurationDays }): Promise<CampaignGenerateResponse> {
  return requestAi("/ai/campaigns/generate", { body: await campaignRequestBody(input), parse: (value) => campaignGenerateResponseSchema.parse(value) });
}

export async function generateCampaignSegment(
  input: CampaignAiInput,
  planning: {
    total_duration_days: CampaignGenerationDurationDays;
    start_day: number;
    outline: CampaignOutline | null;
    previous_weeks: string[];
  }
) {
  return requestAi("/ai/campaigns/segment", {
    body: { ...(await campaignRequestBody(input)), planning_context: planning },
    parse: (value) => campaignGenerateResponseSchema.extend({ campaign: segmentPlanSchema }).parse(value)
  });
}

async function campaignRequestBody(input: CampaignAiInput) {
  const model = await resolveModelSetting("LLM_LONGFORM_MODEL");
  const body = {
    workspace_id: input.workspaceId,
    duration_days: input.durationDays,
    publishes_per_day: input.publishesPerDay,
    starts_at: input.startsAt,
    locale: input.locale,
    ...(input.description ? { description: input.description } : {}),
    ...(input.referenceFiles?.length
      ? {
          reference_files: input.referenceFiles.map((file) => ({
            filename: file.filename,
            mime_type: file.mimeType,
            base64_data: file.base64Data
          }))
        }
      : {}),
    context: input.context.map((chunk) => ({
      section: chunk.section,
      key: chunk.key,
      value: chunk.value,
      score: chunk.score
    })),
    ...(input.promptTemplate === undefined ? {} : { prompt_template: input.promptTemplate }),
    model
  };

  return input.objective === undefined ? body : { ...body, objective: input.objective };
}
