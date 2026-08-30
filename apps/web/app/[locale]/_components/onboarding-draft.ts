import type { KnowledgeVaultEntry, VaultSection } from "@markos/shared-types";

export type OnboardingStepId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface OnboardingDraft {
  audience: string;
  avoid: string;
  businessName: string;
  competitors: string;
  difference: string;
  industry: string;
  market: string;
  motivations: string;
  needs: string;
  offer: string;
  priority: string;
  problem: string;
  story: string;
  toneWords: string;
  voice: string;
}

export type OnboardingValidationIssue = "company" | "products" | "tone";

export const legacyOnboardingDraftKey = "markos.onboarding.draft";
export const previousOnboardingDraftKey = "markos.onboarding.draft.v2";
export const onboardingDraftKey = "markos.onboarding.draft.v3";

export function createEmptyOnboardingDraft(): OnboardingDraft {
  return {
    audience: "",
    avoid: "",
    businessName: "",
    competitors: "",
    difference: "",
    industry: "",
    market: "",
    motivations: "",
    needs: "",
    offer: "",
    priority: "",
    problem: "",
    story: "",
    toneWords: "",
    voice: ""
  };
}

export function createOnboardingDraftFromVault(vault: Record<VaultSection, KnowledgeVaultEntry[]>): OnboardingDraft {
  const company = vaultValue(vault, "COMPANY", "profile");
  const story = vaultValue(vault, "STORY", "story");
  const products = vaultValue(vault, "PRODUCTS", "catalog");
  const audience = vaultValue(vault, "AUDIENCE", "primary-audience");
  const competitors = vaultValue(vault, "COMPETITORS", "competitors");
  const tone = vaultValue(vault, "TONE", "voice");
  const objectives = vaultValue(vault, "OBJECTIVES", "goals");

  return {
    ...createEmptyOnboardingDraft(),
    audience: stringValue(audience.demographics),
    avoid: stringValue(competitors.doDifferently),
    businessName: stringValue(company.name),
    competitors:
      stringValue(competitors.marketContext) ||
      recordArray(competitors.items)
        .map((item) => stringValue(item.name))
        .filter(Boolean)
        .join(", "),
    difference: stringValue(story.usp) || stringValue(story.mission),
    industry: stringValue(company.industry),
    market: stringValue(company.location),
    motivations: joinedValue(audience.motivations),
    needs: joinedValue(audience.painPoints),
    offer: stringValue(products.summary) || productSummary(products.items),
    priority: stringValue(objectives.currentPriority) || joinedValue(objectives.goals),
    problem: stringValue(story.problemSolved),
    story: stringValue(story.origin) || joinedValue(story.values),
    toneWords: joinedValue(tone.toneWords),
    voice: stringValue(tone.voiceNotes)
  };
}

export function splitOnboardingList(value: string): string[] {
  return value
    .split(/[,،]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function hasOnboardingStepData(step: OnboardingStepId, draft: OnboardingDraft): boolean {
  switch (step) {
    case 1:
      return Boolean(draft.businessName.trim() || draft.industry.trim() || draft.market.trim());
    case 2:
      return Boolean(draft.difference.trim() || draft.problem.trim() || draft.story.trim());
    case 3:
      return Boolean(draft.offer.trim());
    case 4:
      return Boolean(draft.audience.trim() || draft.needs.trim() || draft.motivations.trim());
    case 5:
      return Boolean(draft.competitors.trim() || draft.avoid.trim());
    case 6:
      return Boolean(draft.toneWords.trim() || draft.voice.trim());
    case 7:
      return Boolean(draft.priority.trim());
  }
}

export function validateOnboardingStep(step: OnboardingStepId, draft: OnboardingDraft): OnboardingValidationIssue | null {
  if (step === 1 && draft.businessName.trim().length < 2) return "company";
  if (step === 3 && draft.offer.trim().length < 2) return "products";
  if (step === 6 && splitOnboardingList(draft.toneWords).length > 4) return "tone";
  return null;
}

export function payloadForOnboardingStep(step: OnboardingStepId, draft: OnboardingDraft): { body: Record<string, unknown>; module: string } {
  switch (step) {
    case 1:
      return {
        module: "company",
        body: {
          name: draft.businessName.trim(),
          ...(draft.industry.trim() ? { industry: draft.industry.trim() } : {}),
          ...(draft.market.trim() ? { location: draft.market.trim() } : {})
        }
      };
    case 2:
      return {
        module: "story",
        body: {
          ...(draft.difference.trim() ? { usp: draft.difference.trim() } : {}),
          ...(draft.problem.trim() ? { problemSolved: draft.problem.trim() } : {}),
          ...(draft.story.trim() ? { origin: draft.story.trim() } : {})
        }
      };
    case 3:
      return { module: "products", body: { summary: draft.offer.trim() } };
    case 4:
      return {
        module: "audience",
        body: {
          ...(draft.audience.trim() ? { demographics: draft.audience.trim() } : {}),
          motivations: splitOnboardingList(draft.motivations),
          painPoints: draft.needs.trim() ? [draft.needs.trim()] : []
        }
      };
    case 5:
      return {
        module: "competitors",
        body: {
          ...(draft.competitors.trim() ? { marketContext: draft.competitors.trim() } : {}),
          ...(draft.avoid.trim() ? { doDifferently: draft.avoid.trim() } : {})
        }
      };
    case 6:
      return {
        module: "brand",
        body: {
          toneWords: splitOnboardingList(draft.toneWords).slice(0, 4),
          ...(draft.voice.trim() ? { voiceNotes: draft.voice.trim() } : {})
        }
      };
    case 7:
      return { module: "objectives", body: { currentPriority: draft.priority.trim() } };
  }
}

function vaultValue(vault: Record<VaultSection, KnowledgeVaultEntry[]>, section: VaultSection, preferredKey: string): Record<string, unknown> {
  const entries = vault[section] ?? [];
  return entries.find((entry) => entry.key === preferredKey)?.value ?? entries[0]?.value ?? {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function joinedValue(value: unknown): string {
  return stringArray(value).join(", ");
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item)) : [];
}

function productSummary(value: unknown): string {
  return recordArray(value)
    .map((item) => {
      const name = stringValue(item.name);
      const description = stringValue(item.description);
      return [name, description].filter(Boolean).join(": ");
    })
    .filter(Boolean)
    .join("\n");
}
