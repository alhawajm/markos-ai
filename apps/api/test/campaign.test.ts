import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

const contentMock = vi.hoisted(() => ({
  inputs: [] as Array<{ campaignId?: string; contentType: string; count: number; topic: string }>
}));

vi.mock("../src/ai/embeddings-client", () => ({
  embedVaultTexts: async (texts: string[]) => ({
    model: "test-embedding-model",
    dimensions: 1536,
    embeddings: texts.map(testEmbedding)
  })
}));

vi.mock("../src/ai/content-client", () => ({
  generateContentDrafts: async (input: { campaignId?: string; contentType: string; count: number; topic: string }) => {
    contentMock.inputs.push(input);

    return {
      model: "test-content-model",
      prompt_version: "campaign-content.v1.test",
      tokens_in: 23,
      tokens_out: 41,
      drafts: Array.from({ length: input.count }, (_, index) => ({
        contentType: input.contentType,
        captionEn: `${input.contentType} campaign caption ${index + 1}: ${input.topic}`,
        captionAr: `${input.contentType} Arabic campaign caption ${index + 1}`,
        hashtags: ["#MarkosAI", "#BahrainBusiness"],
        callToAction: "Tap to learn more.",
        contentPillar: "Campaign proof",
        ...(input.contentType === "CAROUSEL" ? { carousel: { slides: [{ title: "Campaign hook" }] } } : {}),
        ...(input.contentType === "REEL" ? { reelScript: { hook: "Open with the offer", scenes: ["Problem", "Proof", "CTA"] } } : {})
      }))
    };
  }
}));

describe("campaign workbench routes", () => {
  it("requires Vault context before generating a campaign package", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app, "campaign-empty");

    const response = await app.inject({
      method: "POST",
      url: "/v1/campaigns/packages/generate",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        brief: {
          contentCount: 2,
          contentTypes: ["POST", "STORY"],
          durationDays: 3,
          objective: "Launch a campaign without context"
        }
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: "CAMPAIGN_CONTEXT_MISSING"
      }
    });

    await app.close();
  });

  it("generates, approves, and schedules a workspace-scoped campaign package", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app, "campaign-flow");
    const headers = authHeaders(session.tokens.accessToken);
    await seedVault(app, headers);
    const product = await createCatalogProduct(app, headers);
    const offer = await createCatalogOffer(app, headers, product.id);

    const generated = await app.inject({
      method: "POST",
      url: "/v1/campaigns/packages/generate",
      headers,
      payload: {
        name: "Wholesale Office Coffee Launch",
        brief: {
          audience: "office managers in Bahrain",
          contentCount: 4,
          contentTypes: ["POST", "CAROUSEL", "REEL", "STORY"],
          durationDays: 7,
          objective: "Launch the wholesale office coffee offer with proof and a clear Instagram DM CTA",
          offerId: offer.id,
          productId: product.id,
          tone: "warm, clear, and practical"
        }
      }
    });
    const generatedBody = generated.json().data;

    expect(generated.statusCode).toBe(200);
    expect(generatedBody.campaign).toMatchObject({
      workspaceId: session.workspace.id,
      name: "Wholesale Office Coffee Launch",
      status: "GENERATED",
      structuredBrief: {
        audience: "office managers in Bahrain",
        contentCount: 4,
        durationDays: 7,
        objective: "Launch the wholesale office coffee offer with proof and a clear Instagram DM CTA",
        offerId: offer.id,
        productId: product.id
      }
    });
    expect(generatedBody.campaign.package.items).toHaveLength(4);
    expect(generatedBody.campaign.package.angles.length).toBeGreaterThan(0);
    expect(generatedBody.contentItems.map((item: { campaignId: string; contentType: string; status: string }) => item.contentType)).toEqual([
      "POST",
      "CAROUSEL",
      "REEL",
      "STORY"
    ]);
    expect(generatedBody.contentItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          campaignId: generatedBody.campaign.id,
          status: "DRAFT",
          workspaceId: session.workspace.id
        })
      ])
    );
    expect(contentMock.inputs.slice(-4)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contentType: "POST" }),
        expect.objectContaining({ contentType: "CAROUSEL" }),
        expect.objectContaining({ contentType: "REEL" }),
        expect.objectContaining({ contentType: "STORY" })
      ])
    );

    const contentInteractions = await prisma.aiInteraction.findMany({
      where: {
        workspaceId: session.workspace.id,
        agent: "CONTENT"
      }
    });
    const strategistInteraction = await prisma.aiInteraction.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id,
        agent: "MARKETING_STRATEGIST"
      }
    });
    expect(strategistInteraction).toMatchObject({
      promptVersion: "campaign-workbench.v1",
      currency: "BHD"
    });
    expect(contentInteractions).toHaveLength(4);
    expect(contentInteractions.map((interaction) => interaction.prompt)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          campaignId: generatedBody.campaign.id,
          productId: product.id,
          offerId: offer.id
        })
      ])
    );

    const edited = await app.inject({
      method: "PATCH",
      url: `/v1/content/${generatedBody.contentItems[0].id}`,
      headers,
      payload: {
        captionEn: "Edited campaign caption grounded in the approved wholesale office coffee offer.",
        hashtags: ["#BahrainBusiness", "#OfficeCoffee"]
      }
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().data).toMatchObject({
      campaignId: generatedBody.campaign.id,
      captionEn: "Edited campaign caption grounded in the approved wholesale office coffee offer.",
      status: "DRAFT"
    });

    const approved = await app.inject({
      method: "POST",
      url: `/v1/campaigns/${generatedBody.campaign.id}/approve`,
      headers,
      payload: {}
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().data.campaign.status).toBe("APPROVED");
    expect(approved.json().data.contentItems.every((item: { status: string }) => item.status === "APPROVED")).toBe(true);

    const startDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const scheduled = await app.inject({
      method: "POST",
      url: `/v1/campaigns/${generatedBody.campaign.id}/schedule`,
      headers,
      payload: {
        startDate,
        time: "19:30"
      }
    });
    const scheduledBody = scheduled.json().data;

    expect(scheduled.statusCode).toBe(200);
    expect(scheduledBody.campaign.status).toBe("SCHEDULED");
    expect(scheduledBody.contentItems.every((item: { scheduledAt?: string; status: string }) => item.status === "SCHEDULED" && item.scheduledAt)).toBe(true);
    await expect(
      prisma.contentCalendar.findFirstOrThrow({
        where: {
          workspaceId: session.workspace.id
        }
      })
    ).resolves.toMatchObject({
      plan: {
        scheduledContentIds: expect.arrayContaining(scheduledBody.contentItems.map((item: { id: string }) => item.id))
      }
    });

    await app.close();
  });

  it("records package item rejection feedback without leaking across workspaces", async () => {
    const app = await buildApp();
    const owner = await registerTestUser(app, "campaign-owner");
    const other = await registerTestUser(app, "campaign-other");
    const ownerHeaders = authHeaders(owner.tokens.accessToken);
    const otherHeaders = authHeaders(other.tokens.accessToken);
    await seedVault(app, ownerHeaders);

    const generated = await app.inject({
      method: "POST",
      url: "/v1/campaigns/packages/generate",
      headers: ownerHeaders,
      payload: {
        brief: {
          audience: "Bahrain cafe owners",
          contentCount: 1,
          contentTypes: ["POST"],
          durationDays: 3,
          objective: "Create a proof-led wholesale coffee test campaign"
        }
      }
    });
    const generatedBody = generated.json().data;
    const contentItemId = generatedBody.contentItems[0].id;

    const crossWorkspaceApprove = await app.inject({
      method: "POST",
      url: `/v1/campaigns/${generatedBody.campaign.id}/approve`,
      headers: otherHeaders,
      payload: {}
    });
    expect(crossWorkspaceApprove.statusCode).toBe(404);

    const rejected = await app.inject({
      method: "POST",
      url: `/v1/campaigns/${generatedBody.campaign.id}/items/${contentItemId}/reject`,
      headers: ownerHeaders,
      payload: {
        reason: "Needs a stronger proof point before approval"
      }
    });

    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().data.campaign).toMatchObject({
      status: "IN_REVIEW",
      rejectedIdeas: [
        expect.objectContaining({
          contentItemId,
          reason: "Needs a stronger proof point before approval",
          snapshot: expect.objectContaining({
            contentType: "POST",
            status: "DRAFT"
          })
        })
      ]
    });

    await app.close();
  });
});

async function registerTestUser(app: FastifyInstance, label: string) {
  const email = `${label}-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password: "CorrectHorseBattery99!",
      fullName: "Campaign User",
      workspaceName: `Campaign Workspace ${randomUUID()}`,
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

async function seedVault(app: FastifyInstance, headers: Record<string, string>): Promise<void> {
  await app.inject({
    method: "PUT",
    url: "/v1/vault/company",
    headers,
    payload: {
      entries: [
        {
          key: "profile",
          value: {
            industry: "specialty coffee",
            location: "Manama, Bahrain",
            name: "Pearl Coffee"
          }
        }
      ]
    }
  });
  await app.inject({
    method: "PUT",
    url: "/v1/vault/audience",
    headers,
    payload: {
      entries: [
        {
          key: "primary",
          value: {
            painPoints: ["need reliable office coffee supply"],
            segment: "office managers"
          }
        }
      ]
    }
  });
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`
  };
}

async function createCatalogProduct(app: FastifyInstance, headers: Record<string, string>) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/catalog/products",
    headers,
    payload: {
      benefits: ["bulk packs for offices", "same-day Bahrain delivery"],
      category: "Coffee",
      name: "Wholesale Coffee Starter Pack",
      priceMinor: 32000,
      salesChannels: ["Instagram", "WhatsApp"]
    }
  });

  expect(response.statusCode).toBe(200);
  return response.json().data as { id: string };
}

async function createCatalogOffer(app: FastifyInstance, headers: Record<string, string>, productId: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/catalog/offers",
    headers,
    payload: {
      description: "Introductory discount for new office accounts.",
      priceMinor: 28000,
      productId,
      title: "First wholesale office order offer"
    }
  });

  expect(response.statusCode).toBe(200);
  return response.json().data as { id: string };
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
