import type { OnboardingDocumentExtraction } from "@markos/shared-types";
import { z } from "zod";
import { resolveModelSetting } from "../admin/model-settings-service";
import { requestAi } from "./request";

const nullableText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => value ?? undefined);
const stringList = (max: number, itemMax: number) => z.array(z.string().min(1).max(itemMax)).max(max);

const offeringCandidateSchema = z.object({
  kind: z.enum(["PRODUCT", "SERVICE", "UNSPECIFIED"]),
  name: z.string().min(1).max(160),
  category: nullableText(120),
  description: nullableText(1000),
  priceMinor: z
    .number()
    .int()
    .nonnegative()
    .nullish()
    .transform((value) => value ?? undefined),
  currency: z.string().length(3),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  sourceFiles: stringList(5, 180)
});

export const onboardingDocumentExtractionSchema = z.object({
  profile: z.object({
    company: z.object({
      name: nullableText(160),
      industry: nullableText(120),
      size: nullableText(80),
      location: nullableText(120),
      socials: stringList(20, 160),
      website: nullableText(500),
      languages: stringList(30, 80)
    }),
    offerings: z.object({
      summary: nullableText(4000),
      items: z.array(offeringCandidateSchema).max(30),
      differentiators: stringList(20, 160),
      priceRange: nullableText(120),
      salesChannels: stringList(12, 80)
    }),
    story: z.object({
      mission: nullableText(2000),
      origin: nullableText(2000),
      problemSolved: nullableText(1000),
      values: stringList(30, 80),
      usp: nullableText(1000),
      vision: nullableText(1000)
    }),
    audience: z.object({
      ageRange: nullableText(80),
      demographics: nullableText(1000),
      genderBreakdown: nullableText(120),
      interests: stringList(30, 80),
      locations: stringList(20, 120),
      motivations: stringList(20, 120),
      painPoints: stringList(30, 80)
    }),
    competitors: z.object({
      marketContext: nullableText(2000),
      items: z
        .array(
          z.object({
            name: z.string().min(1).max(160),
            instagramHandle: nullableText(80),
            website: nullableText(500),
            notes: nullableText(1000)
          })
        )
        .max(20),
      competitiveAdvantage: nullableText(1000),
      doDifferently: nullableText(1000)
    }),
    brand: z.object({
      aestheticWords: stringList(20, 80),
      colors: z.array(z.string().regex(/^#[0-9A-F]{6}$/)).max(7),
      fonts: stringList(12, 120),
      toneWords: stringList(4, 80),
      voiceNotes: nullableText(1000)
    }),
    objectives: z.object({
      currentPriority: nullableText(1000),
      goals: stringList(30, 80),
      budgetRange: nullableText(120),
      instagramExperience: nullableText(120),
      success90Days: nullableText(1000)
    })
  }),
  evidence: z
    .array(
      z.object({
        field: z.string().min(1).max(120),
        sourceFiles: stringList(5, 180),
        confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
        basis: z.enum(["EXPLICIT", "VISUAL_INFERENCE"])
      })
    )
    .max(100),
  issues: z
    .array(
      z.object({
        code: z.enum(["MISSING_ESSENTIAL", "AMBIGUOUS_INFORMATION", "CONFLICTING_INFORMATION", "VISUAL_INFERENCE", "REVIEW_REQUIRED", "UNSUPPORTED_CONTENT"]),
        severity: z.enum(["INFO", "WARNING"]),
        message: z.string().min(1).max(500),
        field: nullableText(120),
        sourceFiles: stringList(5, 180)
      })
    )
    .max(50)
});

const responseSchema = z.object({
  model: z.string().min(1),
  prompt_version: z.string().min(1),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  extraction: onboardingDocumentExtractionSchema
});

export interface OnboardingDocumentAnalysisResponse {
  extraction: OnboardingDocumentExtraction;
  model: string;
  prompt_version: string;
  tokens_in: number;
  tokens_out: number;
}

export async function analyzeOnboardingDocuments(input: {
  workspaceId: string;
  files: Array<{ base64Data: string; filename: string; mimeType: string }>;
}): Promise<OnboardingDocumentAnalysisResponse> {
  const model = await resolveModelSetting("LLM_LONGFORM_MODEL");
  return requestAi("/ai/onboarding/documents/analyze", {
    body: {
      workspace_id: input.workspaceId,
      files: input.files.map((file) => ({
        filename: file.filename,
        mime_type: file.mimeType,
        base64_data: file.base64Data
      })),
      model
    },
    parse: (value) => responseSchema.parse(value) as OnboardingDocumentAnalysisResponse
  });
}
