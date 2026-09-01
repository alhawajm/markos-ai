import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

const strategyMock = vi.hoisted(() => ({
  lastInput: undefined as
    | {
        context: Array<{ key: string; section: string; value: Record<string, unknown> }>;
        horizonDays: number;
        objective?: string;
        workspaceId: string;
      }
    | undefined
}));

vi.mock("../src/ai/embeddings-client", () => ({
  embedVaultTexts: async (texts: string[]) => ({
    model: "test-embedding-model",
    dimensions: 1536,
    embeddings: texts.map(testEmbedding)
  })
}));

vi.mock("../src/ai/strategy-client", () => ({
  generateStrategyPlan: async (input: {
    context: Array<{ key: string; section: string; value: Record<string, unknown> }>;
    horizonDays: number;
    objective?: string;
    workspaceId: string;
  }) => {
    strategyMock.lastInput = input;

    return {
      model: "test-strategy-model",
      prompt_version: "strategy.v1.acceptance",
      tokens_in: 144,
      tokens_out: 233,
      strategy: {
        summary: `Grounded ${input.horizonDays}-day plan for ${input.objective ?? "Instagram growth"}`,
        horizonDays: input.horizonDays,
        objectives: [input.objective ?? "grow qualified Instagram inquiries"],
        pillars: [
          {
            name: "Wholesale trust",
            rationale: "Uses completed Vault context from onboarding",
            contentAngles: ["Bahrain office coffee", "supplier consistency"]
          }
        ],
        weeklyCadence: [
          {
            week: 1,
            focus: "Business memory proof",
            actions: ["publish a Pearl Coffee founder post"]
          }
        ],
        kpis: [{ name: "wholesale leads", target: "25" }],
        risks: ["generic content without Vault grounding"],
        nextActions: ["review retrieved Vault context"]
      }
    };
  }
}));

vi.mock("../src/ai/business-profile-client", () => ({
  generateBusinessProfile: async () => ({
    model: "test-profile-model",
    prompt_version: "onboarding-business-profile.v2.acceptance",
    tokens_in: 160,
    tokens_out: 280,
    profile: acceptanceBusinessProfile()
  })
}));

describe("M1 acceptance", () => {
  it("completes onboarding, clears gaps, retrieves Vault context, and grounds a Strategy Agent call", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    const initial = await app.inject({
      method: "GET",
      url: "/v1/onboarding",
      headers
    });

    expect(initial.statusCode).toBe(200);
    expect(initial.json().data.vaultScore).toMatchObject({
      score: 0,
      completedSections: [],
      missingSections: expect.arrayContaining(["COMPANY", "BRAND", "TONE"])
    });
    expect(initial.json().data.modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ module: "company", completed: false }),
        expect.objectContaining({ module: "brand", completed: false, sections: ["TONE"] })
      ])
    );

    await saveAllOnboardingModules(app, headers);

    const generated = await app.inject({
      method: "POST",
      url: "/v1/onboarding/profile/generate",
      headers
    });

    expect(generated.statusCode).toBe(200);
    const draft = generated.json().data.businessProfile;
    expect(draft).toMatchObject({
      status: "DRAFT",
      profile: acceptanceBusinessProfile()
    });

    const complete = await app.inject({
      method: "POST",
      url: "/v1/onboarding/profile/approve",
      headers,
      payload: {
        interactionId: draft.interactionId,
        profile: draft.profile
      }
    });

    expect(complete.statusCode).toBe(200);
    expect(complete.json().data).toMatchObject({
      status: "COMPLETE",
      onboardingScore: 100,
      vaultScore: {
        score: 100,
        missingSections: [],
        completedSections: expect.arrayContaining(["COMPANY", "STORY", "PRODUCTS", "AUDIENCE", "COMPETITORS", "BRAND", "TONE", "OBJECTIVES"])
      },
      modules: expect.arrayContaining([
        expect.objectContaining({ module: "company", completed: true }),
        expect.objectContaining({ module: "brand", completed: true }),
        expect.objectContaining({ module: "objectives", completed: true })
      ]),
      businessProfile: {
        status: "APPROVED",
        profile: acceptanceBusinessProfile()
      }
    });

    const rag = await app.inject({
      method: "POST",
      url: "/v1/vault/rag/search",
      headers,
      payload: {
        query: "Pearl Coffee wholesale Bahrain office coffee warm bilingual tone",
        topK: 8
      }
    });

    expect(rag.statusCode).toBe(200);
    expect(rag.json().data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section: "COMPANY",
          key: "profile",
          value: expect.objectContaining({ name: "Pearl Coffee Roasters" })
        }),
        expect.objectContaining({
          section: "PRODUCTS",
          key: "catalog",
          value: expect.objectContaining({
            items: expect.arrayContaining([expect.objectContaining({ name: "Office Coffee Setup" })])
          })
        }),
        expect.objectContaining({
          section: "TONE",
          key: "voice",
          value: expect.objectContaining({ toneWords: ["warm", "clear", "confident"] })
        })
      ])
    );

    const strategy = await app.inject({
      method: "POST",
      url: "/v1/strategy/generate",
      headers,
      payload: {
        objective: "increase wholesale office coffee leads in Bahrain",
        horizonDays: 90
      }
    });

    expect(strategy.statusCode).toBe(200);
    expect(strategyMock.lastInput).toMatchObject({
      workspaceId: session.workspace.id,
      objective: "increase wholesale office coffee leads in Bahrain",
      horizonDays: 90,
      context: expect.arrayContaining([
        expect.objectContaining({
          section: "COMPANY",
          key: "profile",
          value: expect.objectContaining({ name: "Pearl Coffee Roasters" })
        }),
        expect.objectContaining({
          section: "OBJECTIVES",
          key: "goals",
          value: expect.objectContaining({
            success90Days: "25 wholesale leads from Instagram."
          })
        })
      ])
    });
    expect(strategy.json().data.content).toMatchObject({
      summary: "Grounded 90-day plan for increase wholesale office coffee leads in Bahrain",
      retrievedContext: expect.arrayContaining([
        expect.objectContaining({
          section: "COMPANY",
          value: expect.objectContaining({ name: "Pearl Coffee Roasters" })
        })
      ])
    });

    await app.close();
  });
});

function acceptanceBusinessProfile() {
  const localized = {
    en: "Grounded English business profile.",
    ar: "ملف نشاط عربي موثوق."
  };

  return {
    businessName: "Pearl Coffee",
    tagline: localized,
    overview: localized,
    uniqueValue: localized,
    offerSummary: localized,
    idealCustomer: localized,
    marketPosition: localized,
    brandVoice: localized,
    marketingFocus: localized
  };
}

async function saveAllOnboardingModules(app: Awaited<ReturnType<typeof buildApp>>, headers: Record<string, string>): Promise<void> {
  const requests = [
    app.inject({
      method: "PUT",
      url: "/v1/onboarding/company",
      headers,
      payload: {
        name: "Pearl Coffee Roasters",
        industry: "Specialty coffee",
        size: "SMB",
        location: "Manama, Bahrain",
        socials: ["instagram.com/pearlcoffee"],
        website: "https://pearlcoffee.example",
        languages: ["Arabic", "English"]
      }
    }),
    app.inject({
      method: "PUT",
      url: "/v1/onboarding/story",
      headers,
      payload: {
        mission: "Make specialty coffee approachable for Bahrain office teams and cafe owners.",
        origin: "Started as a family espresso cart serving local events.",
        problemSolved: "Reliable office coffee supply without generic distributor quality.",
        values: ["hospitality", "quality", "clarity"],
        usp: "Fresh roasted GCC-focused blends with Arabic and English service.",
        vision: "Become Bahrain's most trusted office coffee partner."
      }
    }),
    app.inject({
      method: "PUT",
      url: "/v1/onboarding/products",
      headers,
      payload: {
        items: [
          {
            name: "Pearl Blend",
            category: "Coffee beans",
            priceMinor: 3500,
            currency: "BHD",
            description: "Medium roast blend for milk drinks."
          },
          {
            name: "Office Coffee Setup",
            category: "Service",
            priceMinor: 25000,
            currency: "BHD",
            description: "Recurring office coffee supply for Bahrain teams."
          }
        ],
        differentiators: ["locally roasted", "office-friendly"],
        priceRange: "BHD 3.5-25",
        salesChannels: ["Instagram DM", "in-person"]
      }
    }),
    app.inject({
      method: "PUT",
      url: "/v1/onboarding/audience",
      headers,
      payload: {
        ageRange: "25-44",
        demographics: "Bahrain cafe owners, office managers, and coffee enthusiasts.",
        genderBreakdown: "Equal split",
        interests: ["coffee", "hospitality", "local brands"],
        locations: ["Bahrain", "Eastern Saudi"],
        motivations: ["quality", "convenience"],
        painPoints: ["inconsistent beans", "generic cafe suppliers"]
      }
    }),
    app.inject({
      method: "PUT",
      url: "/v1/onboarding/competitors",
      headers,
      payload: {
        items: [
          {
            name: "Harbour Roasts",
            instagramHandle: "harbourroasts",
            website: "https://harbour.example",
            notes: "Strong B2B cafe presence."
          }
        ],
        competitiveAdvantage: "Arabic and English service with GCC blends.",
        doDifferently: "More practical cafe education and transparent sourcing."
      }
    }),
    app.inject({
      method: "PUT",
      url: "/v1/onboarding/brand",
      headers,
      payload: {
        aestheticWords: ["minimal", "warm"],
        colors: ["#0A2342", "#F95738"],
        fonts: ["Inter"],
        toneWords: ["warm", "clear", "confident"],
        voiceNotes: "Helpful, bilingual, and direct."
      }
    }),
    app.inject({
      method: "PUT",
      url: "/v1/onboarding/objectives",
      headers,
      payload: {
        budgetRange: "BHD 200-500",
        goals: ["increase wholesale leads", "grow Instagram reach"],
        instagramExperience: "Some strategy",
        kpiTargets: {
          monthlyLeads: 25,
          engagementRate: "5%"
        },
        success90Days: "25 wholesale leads from Instagram."
      }
    })
  ];
  const responses = await Promise.all(requests);

  for (const response of responses) {
    expect(response.statusCode).toBe(200);
  }
}

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = `m1-acceptance-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password: "CorrectHorseBattery99!",
      fullName: "M1 Acceptance User",
      workspaceName: `M1 Acceptance Workspace ${randomUUID()}`,
      locale: "en"
    }
  });

  const session = response.json().data;

  await prisma.user.update({
    data: {
      isVerified: true
    },
    where: {
      id: session.user.id
    }
  });

  return {
    ...session,
    user: {
      ...session.user,
      isVerified: true
    }
  };
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`
  };
}

function testEmbedding(text: string): number[] {
  const vector = Array.from({ length: 1536 }, () => 0);

  for (const token of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    const index = token.charCodeAt(0) % vector.length;
    vector[index] = (vector[index] ?? 0) + 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  return norm === 0 ? vector : vector.map((value) => value / norm);
}
