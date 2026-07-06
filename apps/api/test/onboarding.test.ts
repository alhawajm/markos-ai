import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

vi.mock("../src/ai/embeddings-client", () => ({
  embedVaultTexts: async (texts: string[]) => ({
    model: "test-embedding-model",
    dimensions: 1536,
    embeddings: texts.map(testEmbedding)
  })
}));

describe("onboarding routes", () => {
  it("persists onboarding modules into the Vault and completes when all sections are ready", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    const initial = await app.inject({
      method: "GET",
      url: "/v1/onboarding",
      headers
    });

    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toMatchObject({
      data: {
        status: "NOT_STARTED",
        onboardingScore: 0,
        vaultScore: {
          score: 0
        },
        modules: expect.arrayContaining([
          expect.objectContaining({ module: "company", completed: false }),
          expect.objectContaining({ module: "brand", completed: false, sections: ["BRAND", "TONE"] })
        ])
      }
    });

    const company = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/company",
      headers,
      payload: {
        name: "Pearl Coffee",
        industry: "Specialty coffee",
        size: "SMB",
        location: "Manama, Bahrain",
        socials: ["instagram.com/pearlcoffee"],
        website: "https://pearlcoffee.example",
        languages: ["Arabic", "English"]
      }
    });

    expect(company.statusCode).toBe(200);
    expect(company.json()).toMatchObject({
      data: {
        status: "IN_PROGRESS",
        onboardingScore: 13,
        vaultScore: {
          completedSections: ["COMPANY"]
        }
      }
    });

    const incomplete = await app.inject({
      method: "POST",
      url: "/v1/onboarding/complete",
      headers
    });

    expect(incomplete.statusCode).toBe(409);
    expect(incomplete.json()).toMatchObject({
      error: {
        code: "ONBOARDING_INCOMPLETE"
      }
    });

    await saveRemainingModules(app, headers);

    const complete = await app.inject({
      method: "POST",
      url: "/v1/onboarding/complete",
      headers
    });

    expect(complete.statusCode).toBe(200);
    expect(complete.json()).toMatchObject({
      data: {
        status: "COMPLETE",
        onboardingScore: 100,
        vaultScore: {
          score: 100,
          missingSections: []
        },
        modules: expect.arrayContaining([
          expect.objectContaining({ module: "brand", completed: true })
        ])
      }
    });

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: {
        id: session.workspace.id
      },
      select: {
        onboardingStatus: true,
        onboardingScore: true
      }
    });
    const tone = await prisma.knowledgeVault.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id,
        section: "TONE",
        key: "voice"
      }
    });
    const brand = await prisma.knowledgeVault.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id,
        section: "BRAND",
        key: "identity"
      }
    });
    const objectives = await prisma.knowledgeVault.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id,
        section: "OBJECTIVES",
        key: "goals"
      }
    });

    expect(workspace).toEqual({
      onboardingStatus: "COMPLETE",
      onboardingScore: 100
    });
    expect(tone.value).toMatchObject({
      toneWords: ["warm", "clear", "confident"]
    });
    expect(brand.value).toMatchObject({
      aestheticWords: ["minimal", "warm"]
    });
    expect(objectives.value).toMatchObject({
      budgetRange: "BHD 200-500",
      instagramExperience: "Some strategy",
      success90Days: "25 wholesale leads from Instagram."
    });

    await app.close();
  });

  it("rejects invalid module payloads", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const response = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/company",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        name: "x"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR"
      }
    });

    await app.close();
  });
});

async function saveRemainingModules(app: Awaited<ReturnType<typeof buildApp>>, headers: Record<string, string>): Promise<void> {
  const requests = [
    app.inject({
      method: "PUT",
      url: "/v1/onboarding/story",
      headers,
      payload: {
        mission: "Make specialty coffee approachable for Bahrain small business meetings.",
        origin: "Started as a family espresso cart.",
        values: ["hospitality", "quality"],
        usp: "Fresh roasted GCC-focused blends with Arabic and English service."
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
            description: "Recurring office coffee supply."
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
        demographics: "Bahrain cafe owners, office managers, and coffee enthusiasts.",
        ageRange: "25-44",
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
        colors: ["#0A2342", "#F95738"],
        fonts: ["Inter"],
        aestheticWords: ["minimal", "warm"],
        toneWords: ["warm", "clear", "confident"],
        voiceNotes: "Helpful, bilingual, and direct."
      }
    }),
    app.inject({
      method: "PUT",
      url: "/v1/onboarding/objectives",
      headers,
      payload: {
        goals: ["increase wholesale leads", "grow Instagram reach"],
        budgetRange: "BHD 200-500",
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
  const email = `onboarding-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password: "CorrectHorseBattery99!",
      fullName: "Onboarding User",
      workspaceName: `Onboarding Workspace ${randomUUID()}`,
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
