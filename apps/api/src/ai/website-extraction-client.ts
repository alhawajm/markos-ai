import { z } from "zod";
import type { VaultWebsiteIngestCandidate } from "@markos/shared-types";
import { vaultWebsiteIngestCandidateSchema } from "@markos/validation";
import { resolveModelSetting } from "../admin/model-settings-service";
import { env } from "../config/env";

export interface WebsiteExtractionPage {
  colors: string[];
  description?: string;
  headline?: string;
  imageAlts: string[];
  links: string[];
  paragraphs: string[];
  siteName?: string;
  title?: string;
  url: string;
}

interface WebsiteExtractionResult {
  candidates: VaultWebsiteIngestCandidate[];
  model: string;
  promptVersion: string;
  tokensIn: number;
  tokensOut: number;
}

const responseSchema = z.object({
  model: z.string().min(1),
  prompt_version: z.string().min(1),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  candidates: z
    .array(
      vaultWebsiteIngestCandidateSchema.extend({
        sourceSnippet: z.string().min(1).max(500),
      }),
    )
    .min(1)
    .max(20),
});

export async function extractWebsiteCandidatesWithAi(input: {
  pages: WebsiteExtractionPage[];
  workspaceId: string;
}): Promise<WebsiteExtractionResult> {
  const model = await resolveModelSetting("WEBSITE_EXTRACTION_MODEL");
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(
        new URL("/ai/vault/extract-website", env.AI_BASE_URL),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            workspace_id: input.workspaceId,
            pages: input.pages.map(toRequestPage),
            model,
            repair: attempt === 1,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `AI website extraction request failed with ${response.status}`,
        );
      }

      const parsedJson: unknown = JSON.parse(await response.text());
      const parsed = responseSchema.safeParse(parsedJson);

      if (!parsed.success) {
        throw new Error(
          "AI website extraction response did not match the strict JSON contract",
        );
      }

      const candidates = parsed.data.candidates.filter((candidate) =>
        hasSourceEvidence(candidate, input.pages),
      );

      if (candidates.length === 0) {
        throw new Error(
          "AI website extraction returned no source-supported claims",
        );
      }

      return {
        candidates,
        model: parsed.data.model,
        promptVersion: parsed.data.prompt_version,
        tokensIn: parsed.data.tokens_in,
        tokensOut: parsed.data.tokens_out,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("AI website extraction failed");
}

function toRequestPage(page: WebsiteExtractionPage): Record<string, unknown> {
  return {
    url: page.url,
    ...(page.title === undefined ? {} : { title: page.title }),
    ...(page.description === undefined
      ? {}
      : { description: page.description }),
    ...(page.siteName === undefined ? {} : { site_name: page.siteName }),
    ...(page.headline === undefined ? {} : { headline: page.headline }),
    paragraphs: page.paragraphs,
    links: page.links,
    image_alts: page.imageAlts,
    colors: page.colors,
  };
}

function hasSourceEvidence(
  candidate: VaultWebsiteIngestCandidate,
  pages: WebsiteExtractionPage[],
): boolean {
  if (
    candidate.confidence < 0.45 ||
    candidate.sourceSnippet === undefined ||
    candidate.sourceSnippet.trim().length === 0
  ) {
    return false;
  }

  const sourcePage = pages.find((item) => item.url === candidate.sourceUrl);

  if (sourcePage === undefined) {
    return false;
  }

  const evidence = [
    sourcePage.title,
    sourcePage.description,
    sourcePage.siteName,
    sourcePage.headline,
    ...sourcePage.paragraphs,
    ...sourcePage.links,
    ...sourcePage.imageAlts,
    ...sourcePage.colors,
  ]
    .filter((value): value is string => value !== undefined)
    .join(" ")
    .toLocaleLowerCase();
  const snippetWords = candidate.sourceSnippet
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter((word) => word.length >= 4);

  return (
    snippetWords.length > 0 &&
    snippetWords.slice(0, 6).every((word) => evidence.includes(word))
  );
}
