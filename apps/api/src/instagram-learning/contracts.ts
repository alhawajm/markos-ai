import { z } from "zod";
import { instagramLearningFields } from "@markos/shared-types";

export const learningSuggestionSchema = z
  .object({
    field: z.enum(instagramLearningFields),
    value: z.union([z.string().max(2000), z.array(z.string().min(1).max(80)).max(20)]),
    reasoning: z.string().min(1).max(1200),
    sourcePostIds: z.array(z.string().min(1).max(100)).max(10)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.field === "colors") {
      if (!Array.isArray(value.value) || !value.value.length || value.value.length > 7 || value.value.some((color) => !/^#[0-9a-f]{6}$/i.test(color)))
        context.addIssue({ code: "custom", message: "Use one to seven six-digit hex colors" });
    } else if (["toneWords", "aestheticWords"].includes(value.field)) {
      if (!Array.isArray(value.value) || value.value.length > (value.field === "toneWords" ? 4 : 20))
        context.addIssue({ code: "custom", message: "Invalid list for this field" });
    } else if (typeof value.value !== "string" || value.value.length > (value.field === "voiceNotes" ? 1000 : 2000))
      context.addIssue({ code: "custom", message: "Invalid text for this field" });
  });
export const learningResultSchema = z
  .object({
    summary: z.string().min(1).max(2000),
    limitations: z.array(z.string().min(1).max(600)).max(12),
    suggestions: z.array(learningSuggestionSchema).max(5)
  })
  .strict()
  .refine((value) => new Set(value.suggestions.map((item) => item.field)).size === value.suggestions.length, "Duplicate field");
export const learningApprovalSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    changes: z
      .array(z.object({ field: z.enum(instagramLearningFields), value: z.union([z.string().max(2000), z.array(z.string().min(1).max(80)).max(20)]) }).strict())
      .max(5)
  })
  .strict()
  .refine((value) => new Set(value.changes.map((item) => item.field)).size === value.changes.length, "Duplicate field");
