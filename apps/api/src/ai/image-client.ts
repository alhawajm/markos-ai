import { z } from "zod";
import { resolveModelSetting } from "../admin/model-settings-service";
import { requestAi } from "./request";

const imageGenerateResponseSchema = z.object({
  base64_data: z.string().min(1).max(12_000_000),
  filename: z.string().min(1).max(240),
  height: z.number().int().min(320).max(2_560),
  mime_type: z.literal("image/jpeg"),
  model: z.string().min(1).max(200),
  prompt: z.string().min(3).max(1_000),
  prompt_version: z.string().min(1).max(120),
  size_bytes: z.number().int().positive().max(8_000_000),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  width: z.number().int().min(320).max(1_440)
});

type ImageGenerateResponse = z.infer<typeof imageGenerateResponseSchema>;

export async function generateImageAsset(input: {
  aspectRatio: "1:1" | "4:5" | "9:16";
  prompt: string;
  promptTemplate?: { body: string; version: string };
  workspaceId: string;
}): Promise<ImageGenerateResponse> {
  const model = await resolveModelSetting("IMAGE_MODEL_PRIMARY");
  return requestAi<ImageGenerateResponse>("/ai/images/generate", {
    body: {
      aspect_ratio: input.aspectRatio,
      model,
      prompt: input.prompt,
      ...(input.promptTemplate === undefined ? {} : { prompt_template: input.promptTemplate }),
      workspace_id: input.workspaceId
    },
    parse: (value) => imageGenerateResponseSchema.parse(value)
  });
}
