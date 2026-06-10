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

    expect(workspace).toEqual({
      onboardingStatus: "COMPLETE",
      onboardingScore: 100
    });
    expect(tone.value).toMatchObject({
      toneWords: ["warm", "clear", "confident"]
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
          }
        ]
      }
    }),
    app.inject({
      method: "PUT",
      url: "/v1/onboarding/audience",
      headers,
      payload: {
        demographics: "Bahrain cafe owners, office managers, and coffee enthusiasts.",
        interests: ["coffee", "hospitality", "local brands"],
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
            notes: "Strong B2B cafe presence."
          }
        ]
      }
    }),
    app.inject({
      method: "PUT",
      url: "/v1/onboarding/brand",
      headers,
      payload: {
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
        goals: ["increase wholesale leads", "grow Instagram reach"],
        kpiTargets: {
          monthlyLeads: 25,
          engagementRate: "5%"
        }
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

  return response.json().data;
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
