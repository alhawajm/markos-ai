import { z } from "zod";
import type { BusinessKnowledgeRecord, OnboardingDocumentProfileDraft } from "@markos/shared-types";

export const quickOnboardingSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    offer: z.string().trim().min(2).max(2000),
    location: z.string().trim().max(120).default(""),
    audience: z.string().trim().max(1000).default(""),
    voice: z.string().trim().max(1000).default(""),
    goal: z.string().trim().max(1000).default("")
  })
  .strict();
export type QuickOnboardingDetails = z.infer<typeof quickOnboardingSchema>;
export const quickOnboardingPreviewSchema = z.object({ details: quickOnboardingSchema, analysisId: z.string().uuid().optional() }).strict();
export const quickOnboardingConfirmSchema = z.object({ interactionId: z.string().uuid() }).strict();
export const instagramOnboardingSchema = z.object({ url: z.string().trim().min(8).max(500) }).strict();
export const emptyQuickOnboarding = (): QuickOnboardingDetails => ({ name: "", offer: "", location: "", audience: "", voice: "", goal: "" });
const text = (v: unknown) => (typeof v === "string" ? v : "");
export function quickDetailsFromKnowledge(knowledge: BusinessKnowledgeRecord): QuickOnboardingDetails {
  const m = knowledge.modules;
  return {
    name: text(m.company.name),
    offer: knowledge.catalog?.summary ?? knowledge.catalog?.offerings.map((i) => i.name).join(", ") ?? "",
    location: text(m.company.location),
    audience: text(m.audience.demographics),
    voice: text(m.brand.voiceNotes) || (Array.isArray(m.brand.toneWords) ? m.brand.toneWords.filter((v): v is string => typeof v === "string").join(", ") : ""),
    goal: text(m.objectives.currentPriority)
  };
}
export function quickDetailsFromDocuments(profile: OnboardingDocumentProfileDraft): QuickOnboardingDetails {
  return {
    name: profile.company.name ?? "",
    offer: profile.offerings.summary ?? profile.offerings.items?.map((i) => i.name).join(", ") ?? "",
    location: profile.company.location ?? "",
    audience: profile.audience.demographics ?? "",
    voice: profile.brand.voiceNotes ?? profile.brand.toneWords.join(", "),
    goal: profile.objectives.currentPriority ?? profile.objectives.goals.join(", ")
  };
}
