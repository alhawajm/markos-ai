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

vi.mock("../src/ai/business-profile-client", () => ({
  generateBusinessProfile: async () => ({
    model: "test-profile-model",
    prompt_version: "onboarding-business-profile.v1.test",
    tokens_in: 180,
    tokens_out: 320,
    profile: testBusinessProfile()
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
        readyForProfile: false,
        vaultScore: {
          score: 0
        },
        businessProfile: {
          status: "NOT_GENERATED",
          interactionId: null,
          profile: null
        },
        modules: expect.arrayContaining([
          expect.objectContaining({ module: "company", completed: false, skipped: false }),
          expect.objectContaining({ module: "brand", completed: false, skipped: false, sections: ["TONE"] })
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

    const notApproved = await app.inject({
      method: "POST",
      url: "/v1/onboarding/complete",
      headers
    });

    expect(notApproved.statusCode).toBe(409);

    const generated = await app.inject({
      method: "POST",
      url: "/v1/onboarding/profile/generate",
      headers
    });

    expect(generated.statusCode).toBe(200);
    expect(generated.json()).toMatchObject({
      data: {
        status: "IN_PROGRESS",
        businessProfile: {
          status: "DRAFT",
          profile: testBusinessProfile()
        }
      }
    });

    const draft = generated.json().data.businessProfile;
    const approvedProfile = {
      ...draft.profile,
      tagline: {
        ...draft.profile.tagline,
        en: "Bahrain coffee, made personal."
      }
    };
    const approved = await app.inject({
      method: "POST",
      url: "/v1/onboarding/profile/approve",
      headers,
      payload: {
        interactionId: draft.interactionId,
        profile: approvedProfile
      }
    });

    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      data: {
        status: "COMPLETE",
        onboardingScore: 100,
        vaultScore: {
          score: 100,
          missingSections: []
        },
        modules: expect.arrayContaining([expect.objectContaining({ module: "brand", completed: true })]),
        businessProfile: {
          status: "APPROVED",
          profile: approvedProfile
        }
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
    const profile = await prisma.knowledgeVault.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id,
        section: "COMPANY",
        key: "business-profile"
      }
    });
    const interaction = await prisma.aiInteraction.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id,
        agent: "ONBOARDING_PROFILE_RESOLVER"
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
    expect(profile.value).toMatchObject(approvedProfile);
    expect(interaction).toMatchObject({
      accepted: true,
      edited: true,
      model: "test-profile-model",
      tokensIn: 180,
      tokensOut: 320
    });

    await app.close();
  });

  it("persists optional skips and completes from the two essential sections", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    const requiredSkip = await app.inject({
      method: "POST",
      url: "/v1/onboarding/company/skip",
      headers
    });
    expect(requiredSkip.statusCode).toBe(409);
    expect(requiredSkip.json()).toMatchObject({ error: { code: "ONBOARDING_MODULE_REQUIRED" } });

    const company = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/company",
      headers,
      payload: { name: "Pearl Coffee" }
    });
    const products = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/products",
      headers,
      payload: { summary: "Coffee beans and recurring office coffee services." }
    });
    expect(company.statusCode).toBe(200);
    expect(products.statusCode).toBe(200);

    for (const module of ["story", "audience", "competitors", "brand", "objectives"]) {
      const skipped = await app.inject({
        method: "POST",
        url: `/v1/onboarding/${module}/skip`,
        headers
      });
      expect(skipped.statusCode).toBe(200);
    }

    const state = await app.inject({ method: "GET", url: "/v1/onboarding", headers });
    expect(state.json()).toMatchObject({
      data: {
        onboardingScore: 25,
        readyForProfile: true,
        modules: expect.arrayContaining([
          expect.objectContaining({ module: "company", completed: true, skipped: false }),
          expect.objectContaining({ module: "story", completed: false, skipped: true }),
          expect.objectContaining({ module: "products", completed: true, skipped: false })
        ])
      }
    });

    const generated = await app.inject({ method: "POST", url: "/v1/onboarding/profile/generate", headers });
    expect(generated.statusCode).toBe(200);
    const draft = generated.json().data.businessProfile;
    const approved = await app.inject({
      method: "POST",
      url: "/v1/onboarding/profile/approve",
      headers,
      payload: { interactionId: draft.interactionId, profile: draft.profile }
    });

    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      data: {
        status: "COMPLETE",
        onboardingScore: 25,
        readyForProfile: true,
        vaultScore: {
          score: 25,
          missingSections: expect.arrayContaining(["STORY", "AUDIENCE", "COMPETITORS", "BRAND", "TONE", "OBJECTIVES"])
        }
      }
    });

    const edited = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/company?preserveApprovedProfile=true",
      headers,
      payload: { name: "Pearl Coffee Roasters" }
    });

    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({
      data: {
        status: "COMPLETE",
        businessProfile: {
          status: "APPROVED",
          interactionId: draft.interactionId,
          profile: draft.profile
        }
      }
    });
    await expect(prisma.aiInteraction.findUniqueOrThrow({ where: { id: draft.interactionId }, select: { regenerated: true } })).resolves.toEqual({
      regenerated: false
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

  it("requires verification and keeps profile drafts isolated by workspace", async () => {
    const app = await buildApp();
    const unverified = await registerTestUser(app, false);
    const unverifiedHeaders = authHeaders(unverified.tokens.accessToken);
    const blockedSave = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/company",
      headers: unverifiedHeaders,
      payload: {
        name: "Pearl Coffee",
        industry: "Specialty coffee",
        size: "SMB",
        location: "Manama, Bahrain",
        socials: [],
        languages: ["Arabic", "English"]
      }
    });

    const blocked = await app.inject({
      method: "POST",
      url: "/v1/onboarding/profile/generate",
      headers: unverifiedHeaders
    });

    expect(blockedSave.statusCode).toBe(403);
    expect(blocked.statusCode).toBe(403);
    expect([blockedSave.json(), blocked.json()]).toEqual([
      expect.objectContaining({
        error: expect.objectContaining({
          code: "EMAIL_VERIFICATION_REQUIRED"
        })
      }),
      expect.objectContaining({
        error: expect.objectContaining({
          code: "EMAIL_VERIFICATION_REQUIRED"
        })
      })
    ]);

    const first = await registerTestUser(app);
    const second = await registerTestUser(app);
    const firstHeaders = authHeaders(first.tokens.accessToken);
    const secondHeaders = authHeaders(second.tokens.accessToken);
    await Promise.all([saveCompanyAndRemainingModules(app, firstHeaders), saveCompanyAndRemainingModules(app, secondHeaders)]);

    const generated = await app.inject({
      method: "POST",
      url: "/v1/onboarding/profile/generate",
      headers: firstHeaders
    });
    const firstDraft = generated.json().data.businessProfile;
    const crossWorkspaceApproval = await app.inject({
      method: "POST",
      url: "/v1/onboarding/profile/approve",
      headers: secondHeaders,
      payload: {
        interactionId: firstDraft.interactionId,
        profile: firstDraft.profile
      }
    });

    expect(crossWorkspaceApproval.statusCode).toBe(404);
    expect(crossWorkspaceApproval.json()).toMatchObject({
      error: {
        code: "BUSINESS_PROFILE_NOT_FOUND"
      }
    });

    await app.close();
  });
});

async function saveCompanyAndRemainingModules(app: Awaited<ReturnType<typeof buildApp>>, headers: Record<string, string>): Promise<void> {
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
  await saveRemainingModules(app, headers);
}

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

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>, verified = true) {
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

  if (verified) {
    await prisma.user.update({
      data: {
        isVerified: true
      },
      where: {
        id: session.user.id
      }
    });
  }

  return {
    ...session,
    user: {
      ...session.user,
      isVerified: verified
    }
  };
}

function testBusinessProfile() {
  const localized = {
    en: "Grounded English profile text.",
    ar: "نص عربي موثوق لملف النشاط."
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
