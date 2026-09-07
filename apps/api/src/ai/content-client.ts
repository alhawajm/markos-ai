import type { CampaignPlan, ContentDraft, ContentToneLock, VaultRagChunk } from "@markos/shared-types";
import { contentCaptionSchema, contentTypeSchema } from "@markos/validation";
import { z } from "zod";
import { resolveModelSetting } from "../admin/model-settings-service";
import { requestAi } from "./request";

interface ContentGenerateResponse {
  model: string;
  prompt_version: string;
  tokens_in: number;
  tokens_out: number;
  drafts: ContentDraft[];
}

const responseSchema = z
  .object({
    model: z.string().min(1),
    prompt_version: z.string().min(1),
    tokens_in: z.number().int().nonnegative(),
    tokens_out: z.number().int().nonnegative(),
    drafts: z
      .array(
        z
          .object({
            contentType: contentTypeSchema,
            caption: contentCaptionSchema,
            visualDirection: z.string().max(2000).nullish(),
            contentPillar: z.string().max(160).nullish(),
            carousel: z.record(z.string(), z.unknown()).nullish(),
            reelScript: z.record(z.string(), z.unknown()).nullish()
          })
          .strict()
      )
      .min(1)
      .max(5)
  })
  .strict();

export async function generateContentDrafts(input: {
  workspaceId: string;
  topic: string;
  contentType: string;
  count: number;
  context: VaultRagChunk[];
  campaign?: CampaignPlan;
  toneLock: ContentToneLock;
  promptTemplate?: { body: string; version: string };
  revision?: { instruction: string; currentDraft: ContentDraft };
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
      preferred_languages: input.toneLock.preferredLanguages,
      tone_words: input.toneLock.toneWords,
      ...(input.toneLock.voiceNotes === undefined ? {} : { voice_notes: input.toneLock.voiceNotes }),
      brand_hints: input.toneLock.brandHints
    },
    ...(input.revision === undefined
      ? {}
      : {
          revision_instruction: input.revision.instruction,
          current_draft: {
            ...input.revision.currentDraft,
            contentPillar: input.revision.currentDraft.contentPillar ?? null,
            carousel: input.revision.currentDraft.carousel ?? null,
            reelScript: input.revision.currentDraft.reelScript ?? null
          }
        }),
    ...(input.promptTemplate === undefined ? {} : { prompt_template: input.promptTemplate }),
    model
  };
  const requestBody = input.campaign === undefined ? body : { ...body, campaign: input.campaign };

  return requestAi<ContentGenerateResponse>("/ai/content/generate", {
    body: requestBody,
    parse: (value) => {
      const response = responseSchema.parse(value);
      if (response.drafts.length !== input.count || response.drafts.some((draft) => draft.contentType !== input.contentType)) {
        throw new Error("Unexpected content draft count or format");
      }
      return {
        ...response,
        drafts: response.drafts.map((draft) => ({
          contentType: draft.contentType,
          caption: draft.caption,
          ...(draft.visualDirection == null ? {} : { visualDirection: draft.visualDirection }),
          ...(draft.contentPillar == null ? {} : { contentPillar: draft.contentPillar }),
          ...(draft.carousel == null ? {} : { carousel: draft.carousel }),
          ...(draft.reelScript == null ? {} : { reelScript: draft.reelScript })
        }))
      };
    }
  });
}
