import type { ContentDraft, StrategyPlan, VaultRagChunk } from "@markos/shared-types";
import { env } from "../config/env";

interface ContentGenerateResponse {
  model: string;
  prompt_version: string;
  tokens_in: number;
  tokens_out: number;
  drafts: ContentDraft[];
}

export async function generateContentDrafts(input: {
  workspaceId: string;
  topic: string;
  contentType: string;
  count: number;
  context: VaultRagChunk[];
  strategy?: StrategyPlan;
}): Promise<ContentGenerateResponse> {
  const body = {
    workspace_id: input.workspaceId,
    topic: input.topic,
    content_type: input.contentType,
    count: input.count,
    context: input.context.map((chunk) => ({
      section: chunk.section,
      key: chunk.key,
      value: chunk.value,
      score: chunk.score
    })),
    model: env.LLM_PRIMARY_MODEL
  };
  const requestBody = input.strategy === undefined ? body : { ...body, strategy: input.strategy };

  const response = await fetch(new URL("/ai/content/generate", env.AI_BASE_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`AI content request failed with ${response.status}`);
  }

  return (await response.json()) as ContentGenerateResponse;
}
