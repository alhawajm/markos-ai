import { z } from "zod";
import { contentCaptionSchema } from "@markos/validation";
import { resolveModelSetting } from "../admin/model-settings-service";
import { requestAi } from "./request";

export const conversationResultSchema = z
  .object({
    reply: z.string().min(1).max(6000),
    summary: z.string().max(4000),
    changes: z
      .object({
        caption: contentCaptionSchema.nullable(),
        brief: z.string().max(1000).nullable(),
        visualDirection: z.string().max(2000).nullable(),
        carousel: z
          .object({
            slides: z
              .array(z.object({ title: z.string().min(1).max(160), body: z.string().min(1).max(800) }).strict())
              .min(3)
              .max(10)
          })
          .strict()
          .nullable(),
        reelScript: z
          .object({
            hook: z.string().min(1).max(300),
            beats: z.array(z.string().min(1).max(500)).min(2).max(8),
            durationSeconds: z.number().int().min(5).max(90)
          })
          .strict()
          .nullable()
      })
      .strict()
      .nullable()
  })
  .strict();

const responseSchema = z
  .object({
    model: z.string().min(1),
    prompt_version: z.string().min(1),
    tokens_in: z.number().int().nonnegative(),
    tokens_out: z.number().int().nonnegative(),
    result: conversationResultSchema
  })
  .strict();

export async function respondToConversation(input: {
  workspace_id: string;
  locale: string;
  message: string;
  current: object;
  context: object;
  history: Array<{ role: string; text: string }>;
  summary: string;
}) {
  return requestAi("/ai/content/conversation", {
    body: { ...input, model: await resolveModelSetting("LLM_PRIMARY_MODEL") },
    parse: (value) => responseSchema.parse(value)
  });
}
