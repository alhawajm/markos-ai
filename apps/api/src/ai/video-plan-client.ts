import { z } from "zod";
import { resolveModelSetting } from "../admin/model-settings-service";
import { requestAi } from "./request";

export const videoRenderPlanSchema = z.object({
  visual_prompt: z.string().min(3).max(4000),
  text_cues: z.array(z.object({
    text: z.string().min(1).max(160),
    start: z.number().min(0).lt(1),
    end: z.number().gt(0).max(1)
  }).refine(cue => cue.end > cue.start && cue.text.trim().length > 0)).max(6)
}).refine(plan => plan.text_cues.every((cue, index) => index === 0 || cue.start >= plan.text_cues[index - 1]!.end));

export type VideoRenderPlan = z.infer<typeof videoRenderPlanSchema>;
const responseSchema = z.object({
  result: videoRenderPlanSchema,
  model: z.string().min(1),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative()
});

export async function prepareVideoRender(input: { workspaceId: string; prompt: string; durationSeconds: 4 | 8 | 12 }) {
  return requestAi("/ai/videos/prepare", {
    body: {
      workspace_id: input.workspaceId, prompt: input.prompt, duration_seconds: input.durationSeconds,
      model: await resolveModelSetting("LLM_PRIMARY_MODEL")
    },
    parse: value => responseSchema.parse(value)
  });
}
