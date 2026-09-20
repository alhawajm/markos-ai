import { z } from "zod";
import { resolveModelSetting } from "../admin/model-settings-service";
import { requestAi } from "./request";

export { assistantResultSchema as conversationResultSchema } from "@markos/validation";
import { assistantResultSchema as conversationResultSchema } from "@markos/validation";
import type { MarkosAuthoringSnapshot } from "@markos/shared-types";

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
  current: MarkosAuthoringSnapshot;
  context: object;
  history: Array<{ role: string; text: string }>;
  summary: string;
}) {
  return requestAi("/ai/content/conversation", {
    body: { ...input, model: await resolveModelSetting("LLM_PRIMARY_MODEL") },
    parse: (value) => responseSchema.parse(value)
  });
}
