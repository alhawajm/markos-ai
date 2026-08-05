import type { ContentDraft, ContentToneLock, StrategyPlan, VaultRagChunk } from "@markos/shared-types";
import { resolveModelSetting } from "../admin/model-settings-service";
import { requestAi } from "./request";

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
  toneLock: ContentToneLock;
  promptTemplate?: { body: string; version: string };
}): Promise<ContentGenerateResponse> {
  const model = await resolveModelSetting("LLM_PRIMARY_MODEL");
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
    tone_lock: {
      required_languages: input.toneLock.requiredLanguages,
      tone_words: input.toneLock.toneWords,
      ...(input.toneLock.voiceNotes === undefined ? {} : { voice_notes: input.toneLock.voiceNotes }),
      brand_hints: input.toneLock.brandHints
    },
    ...(input.promptTemplate === undefined ? {} : { prompt_template: input.promptTemplate }),
    model
  };
  const requestBody = input.strategy === undefined ? body : { ...body, strategy: input.strategy };

  return requestAi<ContentGenerateResponse>("/ai/content/generate", { body: requestBody });
}
