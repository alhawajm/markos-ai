import type { BusinessProfile, VaultRagChunk } from "@markos/shared-types";
import { businessProfileSchema } from "@markos/validation";
import { z } from "zod";
import { resolveModelSetting } from "../admin/model-settings-service";
import { requestAi } from "./request";

const businessProfileGenerateResponseSchema = z.object({
  model: z.string().min(1),
  prompt_version: z.string().min(1),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  profile: businessProfileSchema
});

export interface BusinessProfileGenerateResponse {
  model: string;
  prompt_version: string;
  tokens_in: number;
  tokens_out: number;
  profile: BusinessProfile;
}

export async function generateBusinessProfile(input: { workspaceId: string; context: VaultRagChunk[] }): Promise<BusinessProfileGenerateResponse> {
  const model = await resolveModelSetting("LLM_LONGFORM_MODEL");

  return requestAi("/ai/onboarding/profile/generate", {
    body: {
      workspace_id: input.workspaceId,
      context: input.context.map((chunk) => ({
        section: chunk.section,
        key: chunk.key,
        value: chunk.value,
        score: chunk.score
      })),
      model
    },
    parse: (value) => businessProfileGenerateResponseSchema.parse(value) as BusinessProfileGenerateResponse
  });
}
