import type { KnowledgeVaultEntry, VaultSection } from "@markos/shared-types";
import { onboardingObjectiveFieldLimits } from "@markos/validation";

export type OnboardingStepId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface OnboardingProductDraft {
  category: string;
  description: string;
  name: string;
}

export interface OnboardingDraft {
  ageRange: string;
  audienceDescription: string;
  audienceLocations: string;
  brandColor: string;
  brandFonts: string;
  brandVisualWords: string;
  brandVoiceNotes: string;
  budgetRange: string;
  companyName: string;
  competitiveAdvantage: string;
  competitorDifference: string;
  competitors: string[];
  differentiators: string;
  genderFocus: string;
  goals: string[];
  industry: string;
  instagramExperience: string;
  interests: string;
  languagePreference: string;
  location: string;
  mission: string;
  motivations: string;
  newCompetitor: string;
  newProduct: OnboardingProductDraft;
  origin: string;
  painPoints: string;
  priceRange: string;
  problemSolved: string;
  products: OnboardingProductDraft[];
  salesChannels: string;
  success90Days: string;
  tone: string;
  usp: string;
  values: string;
  vision: string;
  website: string;
}

export type OnboardingValidationIssue = "audience" | "brand" | "company" | "competitors" | "objectives" | "objectivesLength" | "products" | "story";

export const legacyOnboardingDraftKey = "markos.onboarding.draft";
export const onboardingDraftKey = "markos.onboarding.draft.v2";

export function createEmptyOnboardingDraft(): OnboardingDraft {
  return {
    ageRange: "",
    audienceDescription: "",
    audienceLocations: "",
    brandColor: "",
    brandFonts: "",
    brandVisualWords: "",
    brandVoiceNotes: "",
    budgetRange: "",
    companyName: "",
    competitiveAdvantage: "",
    competitorDifference: "",
    competitors: [],
    differentiators: "",
    genderFocus: "",
    goals: [],
    industry: "",
    instagramExperience: "",
    interests: "",
    languagePreference: "",
    location: "",
    mission: "",
    motivations: "",
    newCompetitor: "",
    newProduct: { category: "", description: "", name: "" },
    origin: "",
    painPoints: "",
    priceRange: "",
    problemSolved: "",
    products: [],
    salesChannels: "",
    success90Days: "",
    tone: "",
    usp: "",
    values: "",
    vision: "",
    website: ""
  };
}

export function createOnboardingDraftFromVault(vault: Record<VaultSection, KnowledgeVaultEntry[]>): OnboardingDraft {
  const company = vaultValue(vault, "COMPANY", "profile");
  const story = vaultValue(vault, "STORY", "story");
  const products = vaultValue(vault, "PRODUCTS", "catalog");
  const audience = vaultValue(vault, "AUDIENCE", "primary-audience");
  const competitors = vaultValue(vault, "COMPETITORS", "competitors");
  const brand = vaultValue(vault, "BRAND", "identity");
  const tone = vaultValue(vault, "TONE", "voice");
  const objectives = vaultValue(vault, "OBJECTIVES", "goals");
  const languages = stringArray(company.languages);

  return {
    ...createEmptyOnboardingDraft(),
    ageRange: stringValue(audience.ageRange),
    audienceDescription: stringValue(audience.demographics),
    audienceLocations: joinedValue(audience.locations),
    brandColor: stringArray(brand.colors)[0] ?? "",
    brandFonts: joinedValue(brand.fonts),
    brandVisualWords: joinedValue(brand.aestheticWords),
    brandVoiceNotes: stringValue(tone.voiceNotes),
    budgetRange: stringValue(objectives.budgetRange),
    companyName: stringValue(company.name),
    competitiveAdvantage: stringValue(competitors.competitiveAdvantage),
    competitorDifference: stringValue(competitors.doDifferently),
    competitors: recordArray(competitors.items)
      .map((item) => stringValue(item.name))
      .filter(Boolean),
    differentiators: joinedValue(products.differentiators),
    genderFocus: stringValue(audience.genderBreakdown),
    goals: stringArray(objectives.goals),
    industry: stringValue(company.industry),
    instagramExperience: stringValue(objectives.instagramExperience),
    interests: joinedValue(audience.interests),
    languagePreference: onboardingLanguagePreference(languages),
    location: stringValue(company.location),
    mission: stringValue(story.mission),
    motivations: joinedValue(audience.motivations),
    origin: stringValue(story.origin),
    painPoints: joinedValue(audience.painPoints),
    priceRange: stringValue(products.priceRange),
    problemSolved: stringValue(story.problemSolved),
    products: recordArray(products.items)
      .map((item) => ({
        category: stringValue(item.category),
        description: stringValue(item.description),
        name: stringValue(item.name)
      }))
      .filter((item) => item.name.length > 0),
    salesChannels: joinedValue(products.salesChannels),
    success90Days: stringValue(objectives.success90Days),
    tone: stringArray(tone.toneWords)[0] ?? "",
    usp: stringValue(story.usp),
    values: joinedValue(story.values),
    vision: stringValue(story.vision),
    website: stringValue(company.website)
  };
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

function onboardingLanguagePreference(languages: string[]): string {
  const includesArabic = languages.includes("Arabic");
  const includesEnglish = languages.includes("English");

  if (includesArabic && includesEnglish) return "Both";
  if (includesArabic) return "Arabic";
  if (includesEnglish) return "English";
  return "";
}

export function splitOnboardingList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function validateOnboardingStep(step: OnboardingStepId, draft: OnboardingDraft): OnboardingValidationIssue | null {
  if (
    step === 1 &&
    (draft.companyName.trim().length < 2 || draft.industry.trim().length < 2 || draft.location.trim().length < 2 || !draft.languagePreference)
  ) {
    return "company";
  }

  if (step === 2 && (draft.mission.trim().length < 10 || draft.usp.trim().length < 5 || splitOnboardingList(draft.values).length === 0)) {
    return "story";
  }

  if (step === 3 && (draft.products.length === 0 || draft.products.some((product) => !product.name.trim()))) {
    return "products";
  }

  if (
    step === 4 &&
    (draft.audienceDescription.trim().length < 2 || splitOnboardingList(draft.interests).length === 0 || splitOnboardingList(draft.painPoints).length === 0)
  ) {
    return "audience";
  }

  if (step === 5 && draft.competitors.length === 0) {
    return "competitors";
  }

  if (step === 6 && (!draft.brandColor || !draft.tone)) {
    return "brand";
  }

  if (step === 7) {
    if (draft.goals.length === 0) {
      return "objectives";
    }

    if (
      draft.budgetRange.trim().length > onboardingObjectiveFieldLimits.budgetRange ||
      draft.instagramExperience.trim().length > onboardingObjectiveFieldLimits.instagramExperience ||
      draft.success90Days.trim().length > onboardingObjectiveFieldLimits.success90Days
    ) {
      return "objectivesLength";
    }
  }

  return null;
}

export function payloadForOnboardingStep(step: OnboardingStepId, draft: OnboardingDraft): { body: Record<string, unknown>; module: string } | null {
  if (step === 1) {
    return {
      module: "company",
      body: {
        industry: draft.industry.trim(),
        languages: draft.languagePreference === "Both" ? ["Arabic", "English"] : [draft.languagePreference],
        location: draft.location.trim(),
        name: draft.companyName.trim(),
        ...(draft.website.trim() ? { website: draft.website.trim() } : {})
      }
    };
  }

  if (step === 2) {
    return {
      module: "story",
      body: {
        mission: draft.mission.trim(),
        ...(draft.origin.trim() ? { origin: draft.origin.trim() } : {}),
        ...(draft.problemSolved.trim() ? { problemSolved: draft.problemSolved.trim() } : {}),
        usp: draft.usp.trim(),
        values: splitOnboardingList(draft.values),
        ...(draft.vision.trim() ? { vision: draft.vision.trim() } : {})
      }
    };
  }

  if (step === 3) {
    return {
      module: "products",
      body: {
        differentiators: splitOnboardingList(draft.differentiators),
        items: draft.products.map((product) => ({
          name: product.name.trim(),
          ...(product.category.trim() ? { category: product.category.trim() } : {}),
          ...(product.description.trim() ? { description: product.description.trim() } : {})
        })),
        ...(draft.priceRange.trim() ? { priceRange: draft.priceRange.trim() } : {}),
        salesChannels: splitOnboardingList(draft.salesChannels)
      }
    };
  }

  if (step === 4) {
    return {
      module: "audience",
      body: {
        ...(draft.ageRange ? { ageRange: draft.ageRange } : {}),
        demographics: draft.audienceDescription.trim(),
        ...(draft.genderFocus ? { genderBreakdown: draft.genderFocus } : {}),
        interests: splitOnboardingList(draft.interests),
        locations: splitOnboardingList(draft.audienceLocations),
        motivations: splitOnboardingList(draft.motivations),
        painPoints: splitOnboardingList(draft.painPoints)
      }
    };
  }

  if (step === 5) {
    return {
      module: "competitors",
      body: {
        ...(draft.competitiveAdvantage.trim() ? { competitiveAdvantage: draft.competitiveAdvantage.trim() } : {}),
        ...(draft.competitorDifference.trim() ? { doDifferently: draft.competitorDifference.trim() } : {}),
        items: draft.competitors.map((name) => ({ name: name.trim() }))
      }
    };
  }

  if (step === 6) {
    return {
      module: "brand",
      body: {
        aestheticWords: splitOnboardingList(draft.brandVisualWords),
        colors: [draft.brandColor],
        fonts: splitOnboardingList(draft.brandFonts),
        toneWords: [draft.tone],
        ...(draft.brandVoiceNotes.trim() ? { voiceNotes: draft.brandVoiceNotes.trim() } : {})
      }
    };
  }

  if (step === 7) {
    return {
      module: "objectives",
      body: {
        ...(draft.budgetRange.trim() ? { budgetRange: draft.budgetRange.trim() } : {}),
        goals: draft.goals,
        ...(draft.instagramExperience.trim() ? { instagramExperience: draft.instagramExperience.trim() } : {}),
        ...(draft.success90Days.trim() ? { success90Days: draft.success90Days.trim() } : {})
      }
    };
  }

  return null;
}
