import type { Prisma } from "@prisma/client";
import type { ApprovedOnboardingDocumentProfile, VaultRagChunk, VaultSection } from "@markos/shared-types";
import {
  quickOnboardingPreviewSchema,
  approveOnboardingDocumentAnalysisSchema,
  businessProfileSchema,
  storyOnboardingSchema,
  audienceOnboardingSchema,
  competitorsOnboardingSchema,
  brandOnboardingSchema,
  objectivesOnboardingSchema
} from "@markos/validation";
import { prisma } from "../db/prisma";
import { getBusinessKnowledge } from "../business-profile/knowledge-service";
import { getOnboardingState, saveOnboardingModule } from "./onboarding-service";
import { getActiveOnboardingDocumentAnalysis, approveOnboardingDocumentAnalysis } from "./onboarding-document-service";
import { generateWorkspaceBusinessProfile, approveWorkspaceBusinessProfile, businessProfileAgentName } from "./business-profile-service";

export class QuickOnboardingConflict extends Error {}
export async function previewQuickOnboarding(workspaceId: string, raw: unknown) {
  const input = quickOnboardingPreviewSchema.parse(raw);
  const knowledge = await getBusinessKnowledge(workspaceId);
  if (knowledge.approved) throw new QuickOnboardingConflict("Use Business profile to update a completed setup");
  const analysis = input.analysisId ? await getActiveOnboardingDocumentAnalysis(workspaceId) : null;
  if (input.analysisId && (!analysis || analysis.id !== input.analysisId || analysis.status !== "READY" || !analysis.result))
    throw new QuickOnboardingConflict("The source analysis is no longer ready in this workspace");
  const source = analysis?.result?.profile;
  const d = input.details;
  const candidate = {
    company: {
      ...source?.company,
      name: d.name,
      ...(d.location ? { location: d.location } : {}),
      socials: source?.company.socials ?? [],
      languages: source?.company.languages ?? []
    },
    offerings: { ...source?.offerings, summary: d.offer },
    story: source?.story,
    audience: { ...source?.audience, ...(d.audience ? { demographics: d.audience } : {}) },
    competitors: source?.competitors,
    brand: { ...source?.brand, ...(d.voice ? { voiceNotes: d.voice } : {}) },
    objectives: { ...source?.objectives, ...(d.goal ? { currentPriority: d.goal } : {}) }
  };
  const optional = {
    story: storyOnboardingSchema,
    audience: audienceOnboardingSchema,
    competitors: competitorsOnboardingSchema,
    brand: brandOnboardingSchema,
    objectives: objectivesOnboardingSchema
  };
  const profile: Record<string, unknown> = { company: candidate.company, offerings: candidate.offerings };
  for (const [key, schema] of Object.entries(optional)) {
    const value = schema.safeParse(candidate[key as keyof typeof candidate]);
    if (value.success) profile[key] = value.data;
  }
  const approved = approveOnboardingDocumentAnalysisSchema.parse({ profile }).profile;
  const sections: Record<string, VaultSection> = {
    company: "COMPANY",
    offerings: "PRODUCTS",
    story: "STORY",
    audience: "AUDIENCE",
    competitors: "COMPETITORS",
    brand: "TONE",
    objectives: "OBJECTIVES"
  };
  const context: VaultRagChunk[] = Object.entries(approved).map(([key, value]) => ({
    id: `quick-${key}`,
    section: sections[key]!,
    key: `quick-${key}`,
    value: value as unknown as Record<string, unknown>,
    version: 1,
    score: 1
  }));
  await generateWorkspaceBusinessProfile(workspaceId, {
    context,
    quickSetup: { profile: approved, analysisId: input.analysisId ?? null, knowledgeVersion: knowledge.version } as unknown as Prisma.InputJsonObject
  });
  return getOnboardingState(workspaceId);
}

export async function confirmQuickOnboarding(workspaceId: string, interactionId: string) {
  const interaction = await prisma.aiInteraction.findFirst({
    where: { id: interactionId, workspaceId, agent: businessProfileAgentName, deletedAt: null, regenerated: false }
  });
  if (!interaction) throw new QuickOnboardingConflict("This summary changed. Prepare it again before confirming");
  if (interaction.accepted) return getOnboardingState(workspaceId);
  const prompt = interaction.prompt as Record<string, unknown>;
  const setup = prompt.quickSetup as { profile: ApprovedOnboardingDocumentProfile; analysisId: string | null; knowledgeVersion: number } | undefined;
  const generated = businessProfileSchema.parse((interaction.response as Record<string, unknown>).generatedProfile);
  if (setup) {
    const knowledge = await getBusinessKnowledge(workspaceId);
    if (knowledge.version !== setup.knowledgeVersion) throw new QuickOnboardingConflict("Your business details changed. Prepare a fresh summary");
    const response = interaction.response as Prisma.InputJsonObject;
    if (response.quickConfirmation)
      throw new QuickOnboardingConflict("This summary is being saved or was interrupted. Refresh to check it, or prepare a fresh summary.");
    const claim = await prisma.aiInteraction.updateMany({
      where: { id: interactionId, workspaceId, accepted: false, regenerated: false, updatedAt: interaction.updatedAt },
      data: { response: { ...response, quickConfirmation: "STARTED" } }
    });
    if (!claim.count) {
      const current = await prisma.aiInteraction.findFirst({ where: { id: interactionId, workspaceId, accepted: true } });
      if (current) return getOnboardingState(workspaceId);
      throw new QuickOnboardingConflict("This summary is being saved. Refresh to check it.");
    }
    const profile = approveOnboardingDocumentAnalysisSchema.parse({ profile: setup.profile }).profile;
    if (setup.analysisId) await approveOnboardingDocumentAnalysis(workspaceId, setup.analysisId, { profile }, { preserveProfileInteractionId: interactionId });
    else {
      await saveOnboardingModule(workspaceId, "company", profile.company, { preserveProfileInteractionId: interactionId });
      await saveOnboardingModule(workspaceId, "products", profile.offerings, { preserveProfileInteractionId: interactionId });
      for (const key of ["story", "audience", "competitors", "brand", "objectives"] as const)
        if (profile[key]) await saveOnboardingModule(workspaceId, key, profile[key], { preserveProfileInteractionId: interactionId });
    }
  }
  await approveWorkspaceBusinessProfile(workspaceId, { interactionId, profile: generated });
  return getOnboardingState(workspaceId);
}
