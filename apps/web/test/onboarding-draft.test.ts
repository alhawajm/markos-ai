import { describe, expect, it } from "vitest";
import type { KnowledgeVaultEntry, VaultSection } from "@markos/shared-types";
import {
  createEmptyOnboardingDraft,
  createOnboardingDraftFromVault,
  hasOnboardingStepData,
  legacyOnboardingDraftKey,
  onboardingStepHasChanges,
  onboardingDraftKey,
  payloadForOnboardingStep,
  previousOnboardingDraftKey,
  restoreOnboardingStep,
  validateOnboardingStep,
  type OnboardingDraft
} from "../app/[locale]/_components/onboarding-draft";

function completedDraft(): OnboardingDraft {
  return {
    ...createEmptyOnboardingDraft(),
    audience: "Bahrain office managers and cafe owners",
    avoid: "Avoid generic claims about premium quality",
    businessName: "Pearl Coffee",
    competitors: "Local coffee roasters and large office suppliers",
    difference: "Locally roasted coffee with bilingual service",
    industry: "Specialty coffee",
    market: "Bahrain",
    motivations: "quality, convenience",
    needs: "Reliable office coffee without generic distributor quality",
    offer: "",
    offerings: [
      {
        currency: "BHD",
        description: "Recurring office coffee setup service.",
        kind: "SERVICE",
        name: "Office coffee setup",
        priceMinor: 75_000
      }
    ],
    priority: "Generate more qualified office leads",
    problem: "Inconsistent coffee supply for small teams",
    story: "Started as a family espresso cart.",
    toneWords: "warm, clear, confident",
    voice: "Helpful, bilingual, and direct."
  };
}

describe("onboarding draft contract", () => {
  it("starts without fixture answers and advances the browser draft version", () => {
    const draft = createEmptyOnboardingDraft();

    expect(draft.businessName).toBe("");
    expect(draft.offer).toBe("");
    expect(draft.competitors).toBe("");
    expect(JSON.stringify(draft)).not.toMatch(/Zain|Batelco|STC|zain_bh/i);
    expect(onboardingDraftKey).not.toBe(previousOnboardingDraftKey);
    expect(onboardingDraftKey).not.toBe(legacyOnboardingDraftKey);
  });

  it("restores both the simplified contract and older rich Vault answers", () => {
    const vault = {
      COMPANY: [vaultEntry("COMPANY", "profile", { name: "Pearl Coffee", industry: "Specialty coffee", location: "Bahrain" })],
      STORY: [
        vaultEntry("STORY", "story", {
          origin: "Started as a family espresso cart.",
          problemSolved: "Inconsistent supply",
          usp: "Locally roasted bilingual service"
        })
      ],
      PRODUCTS: [vaultEntry("PRODUCTS", "catalog", { summary: "Coffee beans and office setup services." })],
      AUDIENCE: [
        vaultEntry("AUDIENCE", "primary-audience", {
          demographics: "Bahrain office managers",
          motivations: ["quality", "convenience"],
          painPoints: ["unreliable supply"]
        })
      ],
      COMPETITORS: [vaultEntry("COMPETITORS", "competitors", { marketContext: "Local roasters", doDifferently: "Avoid generic claims" })],
      BRAND: [],
      TONE: [vaultEntry("TONE", "voice", { toneWords: ["warm", "clear"], voiceNotes: "Helpful and direct." })],
      OBJECTIVES: [vaultEntry("OBJECTIVES", "goals", { currentPriority: "Generate office leads" })]
    } satisfies Record<VaultSection, KnowledgeVaultEntry[]>;

    expect(createOnboardingDraftFromVault(vault)).toMatchObject({
      audience: "Bahrain office managers",
      businessName: "Pearl Coffee",
      difference: "Locally roasted bilingual service",
      market: "Bahrain",
      offer: "Coffee beans and office setup services.",
      priority: "Generate office leads",
      toneWords: "warm, clear"
    });

    vault.PRODUCTS = [
      vaultEntry("PRODUCTS", "catalog", {
        items: [{ description: "Medium roast blend.", name: "Pearl Blend" }, { name: "Office setup" }]
      })
    ];
    expect(createOnboardingDraftFromVault(vault).offer).toBe("Pearl Blend: Medium roast blend.\nOffice setup");
  });

  it("requires only a business name and one named offering", () => {
    const empty = createEmptyOnboardingDraft();
    expect(([1, 2, 3, 4, 5, 6, 7] as const).map((step) => validateOnboardingStep(step, empty))).toEqual(["company", "products", null, null, null, null, null]);

    const complete = completedDraft();
    for (const step of [1, 2, 3, 4, 5, 6, 7] as const) {
      expect(validateOnboardingStep(step, complete)).toBeNull();
      expect(hasOnboardingStepData(step, complete)).toBe(true);
    }
  });

  it("accepts a structured offering without requiring prose and stores BHD as integer fils", () => {
    const draft = createEmptyOnboardingDraft();
    draft.offerings = [
      {
        currency: "BHD",
        description: "Monthly bilingual content planning.",
        kind: "SERVICE",
        name: "Content planning",
        priceMinor: 125_500
      },
      {
        currency: "BHD",
        description: "",
        kind: "UNSPECIFIED",
        name: ""
      }
    ];

    expect(validateOnboardingStep(2, draft)).toBeNull();
    expect(payloadForOnboardingStep(2, draft)).toEqual({
      module: "products",
      body: {
        items: [
          {
            currency: "BHD",
            description: "Monthly bilingual content planning.",
            kind: "SERVICE",
            name: "Content planning",
            priceMinor: 125_500
          }
        ]
      }
    });
  });

  it("limits tone to four removable words", () => {
    const draft = completedDraft();
    draft.toneWords = "warm, clear, confident, direct, playful";
    expect(validateOnboardingStep(6, draft)).toBe("tone");

    draft.toneWords = "warm، clear, confident, direct";
    expect(validateOnboardingStep(6, draft)).toBeNull();
  });

  it("detects and restores changes only within the active step", () => {
    const baseline = completedDraft();
    const edited = {
      ...baseline,
      businessName: "Edited Coffee",
      offerings: baseline.offerings.map((item) => ({ ...item, name: "Edited service" }))
    };

    expect(onboardingStepHasChanges(1, baseline, edited)).toBe(true);
    expect(onboardingStepHasChanges(2, baseline, edited)).toBe(true);
    expect(onboardingStepHasChanges(3, baseline, edited)).toBe(false);
    expect(restoreOnboardingStep(1, baseline, edited)).toMatchObject({
      businessName: baseline.businessName,
      offerings: edited.offerings
    });
  });

  it("maps the concise fields onto all seven workspace-scoped Vault modules", () => {
    const draft = completedDraft();
    const payloads = ([1, 2, 3, 4, 5, 6, 7] as const).map((step) => payloadForOnboardingStep(step, draft));

    expect(payloads.map((payload) => payload.module)).toEqual(["company", "products", "story", "audience", "competitors", "brand", "objectives"]);
    expect(payloads[0]?.body).toEqual({ industry: "Specialty coffee", location: "Bahrain", name: "Pearl Coffee" });
    expect(payloads[1]?.body).toEqual({
      items: [
        {
          currency: "BHD",
          description: "Recurring office coffee setup service.",
          kind: "SERVICE",
          name: "Office coffee setup",
          priceMinor: 75_000
        }
      ]
    });
    expect(payloads[2]?.body).toEqual({ origin: draft.story, problemSolved: draft.problem, usp: draft.difference });
    expect(payloads[3]?.body).toEqual({ demographics: draft.audience, motivations: ["quality", "convenience"], painPoints: [draft.needs] });
    expect(payloads[4]?.body).toEqual({ doDifferently: draft.avoid, marketContext: draft.competitors });
    expect(payloads[5]?.body).toEqual({ toneWords: ["warm", "clear", "confident"], voiceNotes: draft.voice });
    expect(payloads[6]?.body).toEqual({ currentPriority: draft.priority });
    expect(JSON.stringify(payloads)).not.toMatch(/Zain|Batelco|STC|zain_bh/i);
  });
});

function vaultEntry(section: VaultSection, key: string, value: Record<string, unknown>): KnowledgeVaultEntry {
  return {
    createdAt: "2026-08-20T06:00:00.000Z",
    id: `${section}-${key}`,
    key,
    section,
    updatedAt: "2026-08-20T06:00:00.000Z",
    value,
    version: 1,
    workspaceId: "workspace-pearl"
  };
}
