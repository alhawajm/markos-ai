import type { OfferingDocumentExtraction } from "@markos/shared-types";
import { z } from "zod";
import { resolveModelSetting } from "../admin/model-settings-service";
import { requestAi } from "./request";

const candidateSchema = z.object({
  kind: z.enum(["PRODUCT", "SERVICE", "UNSPECIFIED"]),
  name: z.string().min(1).max(160),
  category: z.string().max(120).optional(),
  description: z.string().max(1000).optional(),
  priceMinor: z.number().int().nonnegative().optional(),
  currency: z.string().length(3),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  sourceFiles: z.array(z.string().min(1).max(180)).min(1).max(2)
});

const issueSchema = z.object({
  code: z.enum([
    "NO_OFFERINGS_FOUND",
    "AMBIGUOUS_OFFERING",
    "MISSING_DESCRIPTION",
    "MISSING_PRICE",
    "CONFLICTING_INFORMATION",
    "POSSIBLE_NON_OFFERING",
    "REVIEW_REQUIRED",
    "SOURCE_TRUNCATED"
  ]),
  severity: z.enum(["INFO", "WARNING"]),
  message: z.string().min(1).max(500),
  field: z.string().max(120).optional(),
  offeringName: z.string().max(160).optional(),
  sourceFiles: z.array(z.string().min(1).max(180)).max(2)
});

export const offeringDocumentExtractionSchema = z.object({
  catalog: z.object({
    summary: z.string().max(4000).optional(),
    items: z.array(candidateSchema).max(30),
    differentiators: z.array(z.string().min(1).max(160)).max(20),
    priceRange: z.string().max(120).optional(),
    salesChannels: z.array(z.string().min(1).max(80)).max(12)
  }),
  issues: z.array(issueSchema).max(30)
});

const responseSchema = z.object({
  model: z.string().min(1),
  prompt_version: z.string().min(1),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  extraction: offeringDocumentExtractionSchema
});

export interface OfferingDocumentAnalysisResponse {
  extraction: OfferingDocumentExtraction;
  model: string;
  prompt_version: string;
  tokens_in: number;
  tokens_out: number;
}

export async function analyzeOfferingDocuments(input: {
  workspaceId: string;
  files: Array<{ base64Data: string; filename: string; mimeType: string }>;
}): Promise<OfferingDocumentAnalysisResponse> {
  const model = await resolveModelSetting("LLM_LONGFORM_MODEL");
  return requestAi("/ai/onboarding/offerings/analyze", {
    body: {
      workspace_id: input.workspaceId,
      files: input.files.map((file) => ({
        filename: file.filename,
        mime_type: file.mimeType,
        base64_data: file.base64Data
      })),
      model
    },
    parse: (value) => responseSchema.parse(value) as OfferingDocumentAnalysisResponse
  });
}
