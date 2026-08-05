import { resolveModelSetting } from "../admin/model-settings-service";
import { requestAi } from "./request";

interface ImageGenerateResponse {
  base64_data: string;
  filename: string;
  height: number;
  mime_type: string;
  model: string;
  prompt: string;
  prompt_version: string;
  size_bytes: number;
  tokens_in: number;
  tokens_out: number;
  width: number;
}

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
    }
  });
}
