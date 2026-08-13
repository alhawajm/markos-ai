import { describe, expect, it } from "vitest";
import {
  createEmptyOnboardingDraft,
  legacyOnboardingDraftKey,
  onboardingDraftKey,
  payloadForOnboardingStep,
  validateOnboardingStep,
  type OnboardingDraft
} from "../app/[locale]/_components/onboarding-draft";

function completedDraft(): OnboardingDraft {
  return {
    ...createEmptyOnboardingDraft(),
    ageRange: "25-34",
    audienceDescription: "Bahrain office managers and cafe owners",
    audienceLocations: "Manama, Muharraq",
    brandColor: "#81D8D0",
    brandFonts: "Inter, Noto Sans Arabic",
    brandVisualWords: "warm, precise",
    brandVoiceNotes: "Clear, helpful, and grounded in local hospitality.",
    budgetRange: "BHD 500-1000",
    companyName: "Pearl Coffee",
    competitiveAdvantage: "Locally roasted bilingual service",
    competitorDifference: "Explain sourcing and freshness clearly",
    competitors: ["Harbour Roasts"],
    differentiators: "locally roasted, office-friendly",
    genderFocus: "All",
    goals: ["Increase brand awareness"],
    industry: "Food & Beverage",
    instagramExperience: "New professional account",
    interests: "coffee, hospitality, local brands",
    languagePreference: "Both",
    location: "Manama, Bahrain",
    mission: "Make specialty coffee approachable for Bahrain teams.",
    motivations: "quality, convenience",
    origin: "Started as a family espresso cart.",
    painPoints: "inconsistent beans, generic suppliers",
    priceRange: "BHD 3.5-25",
    problemSolved: "Reliable office coffee without generic quality.",
    products: [
      {
        category: "Coffee beans",
        description: "Medium roast blend for milk drinks.",
        name: "Pearl Blend"
      }
    ],
    salesChannels: "Instagram DM, in-person",
    success90Days: "Generate 25 qualified office leads.",
    tone: "friendly",
    usp: "Fresh GCC-focused blends with Arabic and English service.",
    values: "hospitality, quality, clarity",
    vision: "Become Bahrain's most trusted office coffee partner.",
    website: "https://pearlcoffee.example"
  };
}

describe("onboarding draft contract", () => {
  it("starts without fixture answers and uses a versioned browser key", () => {
    const draft = createEmptyOnboardingDraft();

    expect(draft.companyName).toBe("");
    expect(draft.products).toEqual([]);
    expect(draft.competitors).toEqual([]);
    expect(draft.goals).toEqual([]);
    expect(JSON.stringify(draft)).not.toMatch(/Zain|Batelco|STC|zain_bh/i);
    expect(onboardingDraftKey).not.toBe(legacyOnboardingDraftKey);
  });

  it("requires the user-owned fields needed by every Vault module", () => {
    const empty = createEmptyOnboardingDraft();
    expect(Array.from({ length: 7 }, (_, index) => validateOnboardingStep((index + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7, empty))).toEqual([
      "company",
      "story",
      "products",
      "audience",
      "competitors",
      "brand",
      "objectives"
    ]);

    const complete = completedDraft();
    for (const step of [1, 2, 3, 4, 5, 6, 7] as const) {
      expect(validateOnboardingStep(step, complete)).toBeNull();
    }
  });

  it("rejects objective text that exceeds the API contract", () => {
    const draft = completedDraft();

    draft.instagramExperience = "x".repeat(121);
    expect(validateOnboardingStep(7, draft)).toBe("objectivesLength");

    draft.instagramExperience = "x".repeat(120);
    expect(validateOnboardingStep(7, draft)).toBeNull();
  });

  it("builds all seven payloads only from disclosed draft answers", () => {
    const draft = completedDraft();
    const payloads = ([1, 2, 3, 4, 5, 6, 7] as const).map((step) => payloadForOnboardingStep(step, draft));

    expect(payloads.map((payload) => payload?.module)).toEqual(["company", "story", "products", "audience", "competitors", "brand", "objectives"]);
    expect(payloads[0]?.body).toEqual({
      industry: "Food & Beverage",
      languages: ["Arabic", "English"],
      location: "Manama, Bahrain",
      name: "Pearl Coffee",
      website: "https://pearlcoffee.example"
    });
    expect(payloads[1]?.body).toMatchObject({
      mission: draft.mission,
      usp: draft.usp,
      values: ["hospitality", "quality", "clarity"]
    });
    expect(payloads[2]?.body).toMatchObject({
      differentiators: ["locally roasted", "office-friendly"],
      items: [
        {
          category: "Coffee beans",
          description: "Medium roast blend for milk drinks.",
          name: "Pearl Blend"
        }
      ],
      salesChannels: ["Instagram DM", "in-person"]
    });
    expect(payloads[3]?.body).toMatchObject({
      demographics: draft.audienceDescription,
      interests: ["coffee", "hospitality", "local brands"],
      motivations: ["quality", "convenience"],
      painPoints: ["inconsistent beans", "generic suppliers"]
    });
    expect(payloads[4]?.body).toEqual({
      competitiveAdvantage: draft.competitiveAdvantage,
      doDifferently: draft.competitorDifference,
      items: [{ name: "Harbour Roasts" }]
    });
    expect(payloads[5]?.body).toMatchObject({
      aestheticWords: ["warm", "precise"],
      colors: ["#81D8D0"],
      fonts: ["Inter", "Noto Sans Arabic"],
      toneWords: ["friendly"]
    });
    expect(payloads[6]?.body).toEqual({
      budgetRange: "BHD 500-1000",
      goals: ["Increase brand awareness"],
      instagramExperience: "New professional account",
      success90Days: "Generate 25 qualified office leads."
    });
    expect(JSON.stringify(payloads)).not.toMatch(/Zain|Batelco|STC|zain_bh/i);
  });

  it("trims optional objective text before saving it", () => {
    const draft = completedDraft();
    draft.budgetRange = "  BHD 500-1000  ";
    draft.instagramExperience = "  New professional account  ";
    draft.success90Days = "  Generate 25 qualified office leads.  ";

    expect(payloadForOnboardingStep(7, draft)?.body).toMatchObject({
      budgetRange: "BHD 500-1000",
      instagramExperience: "New professional account",
      success90Days: "Generate 25 qualified office leads."
    });
  });
});
