import { z } from "zod";
import type { InstagramLearningEvidence, InstagramLearningRecord } from "@markos/shared-types";
import { requestAi } from "./request";
import { resolveModelSetting } from "../admin/model-settings-service";
import { learningResultSchema } from "../instagram-learning/contracts";
import type { LearningVisual } from "../instagram-learning/evidence";

const responseSchema = z
  .object({
    model: z.string().min(1),
    prompt_version: z.string().min(1),
    tokens_in: z.number().int().nonnegative(),
    tokens_out: z.number().int().nonnegative(),
    result: learningResultSchema
  })
  .strict();
export async function generateInstagramLearning(input: {
  workspace_id: string;
  locale: "ar" | "en";
  evidence: InstagramLearningEvidence;
  current: InstagramLearningRecord["current"];
  visuals: LearningVisual[];
}) {
  return requestAi("/ai/onboarding/instagram/analyze", {
    body: { ...input, model: await resolveModelSetting("LLM_PRIMARY_MODEL") },
    parse: (value) => responseSchema.parse(value)
  });
}
