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

vi.mock("../src/ai/campaign-client", () => ({
  generateCampaignPlan: async (input: { context: unknown[]; durationDays: number; objective?: string; publishesPerDay: number; workspaceId: string }) => ({
    model: "test-campaign-model",
    prompt_version: "campaign.v2.test",
    tokens_in: 101,
    tokens_out: 202,
    campaign: {
      summary: `${input.durationDays}-day campaign for ${input.objective ?? "Instagram growth"}`,
      durationDays: input.durationDays,
      publishesPerDay: input.publishesPerDay,
      objectives: [input.objective ?? "grow qualified Instagram inquiries"],
      pillars: [
        {
          name: "Proof and trust",
          rationale: "Grounded in Vault context",
          contentAngles: ["customer outcomes", "process"]
        }
      ],
      weeklyCadence: Array.from({ length: Math.ceil(input.durationDays / 7) }, (_, weekIndex) => ({
        week: weekIndex + 1,
        focus: weekIndex === 0 ? "Message clarity" : "Trust and action",
        days: Array.from({ length: Math.min(7, input.durationDays - weekIndex * 7) }, (_, dayIndex) => {
          const day = weekIndex * 7 + dayIndex + 1;
          return {
            day,
            posts: Array.from({ length: input.publishesPerDay }, (_, postIndex) => ({
              contentType: postIndex % 2 === 0 ? "CAROUSEL" : "REEL",
              title: `Campaign day ${day} idea ${postIndex + 1}`,
              description: "Explain the offer with a specific, grounded angle.",
              goal: "Increase qualified awareness",
              contentPillar: "Proof and trust"
            }))
          };
        })
      })),
      kpis: [
        {
          name: "qualified inquiries",
          target: "increase"
        }
      ],
      risks: ["generic content"],
      nextActions: ["review Vault context"]
    }
  })
}));

describe("campaign routes", () => {
  it("keeps future campaign durations out of the generation contract", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const response = await app.inject({
      method: "POST",
      url: "/v1/campaigns/generate",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        durationDays: 30,
        startsAt: "2026-09-01T00:00:00.000Z"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    await app.close();
  });

  it("requires Business Profile context before generating a campaign", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const response = await app.inject({
      method: "POST",
      url: "/v1/campaigns/generate",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        durationDays: 14,
        startsAt: "2026-09-01T00:00:00.000Z"
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

  it("generates a Business Profile-grounded campaign and meters the interaction", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const periodStart = monthStart(new Date());

    await app.inject({
      method: "PUT",
      url: "/v1/vault/company",
      headers,
      payload: {
        entries: [
          {
            key: "profile",
            value: {
              name: "Pearl Coffee",
              industry: "specialty coffee",
              location: "Manama, Bahrain"
            }
          }
        ]
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/campaigns/generate",
      headers,
      payload: {
        objective: "increase wholesale cafe leads",
        durationDays: 14,
        publishesPerDay: 2,
        startsAt: "2026-09-01T00:00:00.000Z"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        workspaceId: session.workspace.id,
        title: "14-day campaign: increase wholesale cafe leads",
        durationDays: 14,
        publishesPerDay: 2,
        status: "REVIEW",
        content: {
          summary: "14-day campaign for increase wholesale cafe leads",
          retrievedContext: [
            expect.objectContaining({
              section: "COMPANY",
              key: "profile"
            })
          ]
        }
      }
    });

    const interaction = await prisma.aiInteraction.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id,
        agent: "STRATEGIST"
      }
    });
    const list = await app.inject({
      method: "GET",
      url: "/v1/campaigns",
      headers
    });

    expect(interaction).toMatchObject({
      promptVersion: "campaign.v2.test",
      tokensIn: 101,
      tokensOut: 202,
      costMinor: 0,
      currency: "BHD",
      model: "test-campaign-model"
    });
    await expect(
      prisma.usageCounter.findUniqueOrThrow({
        where: {
          workspaceId_metric_periodStart: {
            workspaceId: session.workspace.id,
            metric: "CAMPAIGN",
            periodStart
          }
        }
      })
    ).resolves.toMatchObject({
      used: 1n,
      limit: 1n
    });
    await expect(
      prisma.usageCounter.findUniqueOrThrow({
        where: {
          workspaceId_metric_periodStart: {
            workspaceId: session.workspace.id,
            metric: "AI_GENERATION",
            periodStart
          }
        }
      })
    ).resolves.toMatchObject({
      used: 1n,
      limit: 100n
    });
    await expect(
      prisma.usageCounter.findUniqueOrThrow({
        where: {
          workspaceId_metric_periodStart: {
            workspaceId: session.workspace.id,
            metric: "AI_TOKENS_IN",
            periodStart
          }
        }
      })
    ).resolves.toMatchObject({
      used: 101n
    });
    await expect(
      prisma.usageCounter.findUniqueOrThrow({
        where: {
          workspaceId_metric_periodStart: {
            workspaceId: session.workspace.id,
            metric: "AI_TOKENS_OUT",
            periodStart
          }
        }
      })
    ).resolves.toMatchObject({
      used: 202n
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data[0]).toMatchObject({
      title: "14-day campaign: increase wholesale cafe leads"
    });

    await app.close();
  });

  it("approves an exact Campaign suggestion once and registers its draft in Create and Calendar", async () => {
    const app = await buildApp();
    const owner = await registerTestUser(app);
    const other = await registerTestUser(app);
    const headers = authHeaders(owner.tokens.accessToken);
    const campaign = await prisma.campaign.create({
      data: {
        workspaceId: owner.workspace.id,
        title: "SnackLab launch",
        startsAt: new Date("2026-09-01T00:00:00.000Z"),
        endsAt: new Date("2026-09-14T00:00:00.000Z"),
        durationDays: 14,
        publishesPerDay: 1,
        content: {
          summary: "Launch SnackLab",
          durationDays: 14,
          publishesPerDay: 1,
          objectives: ["Increase qualified subscriptions"],
          pillars: [],
          weeklyCadence: [
            {
              week: 1,
              focus: "Explain the offer",
              days: [
                {
                  day: 1,
                  posts: [
                    {
                      contentType: "CAROUSEL",
                      title: "Publish launch carousel",
                      description: "Introduce the subscription paths and their value.",
                      goal: "Explain the offer",
                      contentPillar: "Offer education"
                    }
                  ]
                }
              ]
            }
          ],
          kpis: [],
          risks: [],
          nextActions: [],
          retrievedContext: []
        }
      }
    });
    const approvalPayload = { week: 1, actionIndex: 0 };

    const firstApproval = await app.inject({
      method: "POST",
      url: `/v1/campaigns/${campaign.id}/suggestions/approve`,
      headers,
      payload: approvalPayload
    });
    const repeatedApproval = await app.inject({
      method: "POST",
      url: `/v1/campaigns/${campaign.id}/suggestions/approve`,
      headers,
      payload: approvalPayload
    });
    const campaignDrafts = await app.inject({
      method: "GET",
      url: `/v1/campaigns/${campaign.id}/drafts`,
      headers
    });
    const createRecords = await app.inject({ method: "GET", url: "/v1/content", headers });
    const calendar = await app.inject({
      method: "GET",
      url: "/v1/calendar?from=2026-09-01&to=2026-09-30",
      headers
    });
    const foreignApproval = await app.inject({
      method: "POST",
      url: `/v1/campaigns/${campaign.id}/suggestions/approve`,
      headers: authHeaders(other.tokens.accessToken),
      payload: approvalPayload
    });
    const foreignDrafts = await app.inject({
      method: "GET",
      url: `/v1/campaigns/${campaign.id}/drafts`,
      headers: authHeaders(other.tokens.accessToken)
    });
    const draft = firstApproval.json().data;

    expect(firstApproval.statusCode).toBe(200);
    expect(draft).toMatchObject({
      workspaceId: owner.workspace.id,
      platform: "INSTAGRAM",
      status: "DRAFT",
      contentType: "CAROUSEL",
      brief: "Publish launch carousel\nIntroduce the subscription paths and their value.",
      campaignId: campaign.id,
      campaignGoal: "Explain the offer",
      contentPillar: "Offer education",
      campaignWeek: 1,
      campaignActionIndex: 0,
      plannedAt: "2026-09-01T00:00:00.000Z"
    });
    expect(repeatedApproval.statusCode).toBe(200);
    expect(repeatedApproval.json().data.id).toBe(draft.id);
    expect(campaignDrafts.json().data).toHaveLength(1);
    expect(createRecords.json().data).toEqual(expect.arrayContaining([expect.objectContaining({ id: draft.id })]));
    expect(calendar.json().data.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: draft.id, campaignId: campaign.id, plannedAt: "2026-09-01T00:00:00.000Z" })])
    );
    expect(calendar.json().data.unscheduled.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: draft.id })]));
    await expect(
      prisma.contentItem.count({
        where: { campaignId: campaign.id, campaignWeek: 1, campaignActionIndex: 0 }
      })
    ).resolves.toBe(1);
    expect(foreignApproval.statusCode).toBe(404);
    expect(foreignDrafts.statusCode).toBe(404);

    await app.close();
  });

  it("exports a saved campaign as a workspace-scoped PDF", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    await app.inject({
      method: "PUT",
      url: "/v1/vault/company",
      headers,
      payload: {
        entries: [
          {
            key: "profile",
            value: {
              name: "Pearl Coffee",
              industry: "specialty coffee",
              location: "Manama, Bahrain"
            }
          }
        ]
      }
    });

    const generated = await app.inject({
      method: "POST",
      url: "/v1/campaigns/generate",
      headers,
      payload: {
        objective: "increase wholesale cafe leads",
        durationDays: 14,
        publishesPerDay: 2,
        startsAt: "2026-09-01T00:00:00.000Z"
      }
    });
    const campaignId = generated.json().data.id as string;
    const response = await app.inject({
      method: "GET",
      url: `/v1/campaigns/${campaignId}/pdf`,
      headers
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toBe('attachment; filename="14-day-campaign-increase-wholesale-cafe-leads.pdf"');
    expect(response.body.startsWith("%PDF-1.4")).toBe(true);
    expect(response.body).toContain("MARKOS AI Campaign Export");
    expect(response.body).toContain("14-day campaign: increase wholesale cafe leads");
    expect(response.body.trimEnd().endsWith("%%EOF")).toBe(true);

    await app.close();
  });

  it("does not export a campaign from another workspace", async () => {
    const app = await buildApp();
    const owner = await registerTestUser(app);
    const other = await registerTestUser(app);
    const startsAt = new Date("2026-09-01T00:00:00.000Z");
    const campaign = await prisma.campaign.create({
      data: {
        workspaceId: owner.workspace.id,
        title: "Owner-only campaign",
        startsAt,
        endsAt: new Date("2026-11-30T00:00:00.000Z"),
        durationDays: 90,
        publishesPerDay: 1,
        content: {
          summary: "Private campaign",
          durationDays: 90,
          publishesPerDay: 1,
          objectives: ["protect workspace data"],
          pillars: [],
          weeklyCadence: [],
          kpis: [],
          risks: [],
          nextActions: [],
          retrievedContext: []
        }
      }
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/campaigns/${campaign.id}/pdf`,
      headers: authHeaders(other.tokens.accessToken)
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: {
        code: "CAMPAIGN_NOT_FOUND"
      }
    });

    await app.close();
  });

  it("blocks campaign generation when the plan quota is exhausted", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const periodStart = monthStart(new Date());

    await app.inject({
      method: "PUT",
      url: "/v1/vault/company",
      headers,
      payload: {
        entries: [
          {
            key: "profile",
            value: {
              name: "Pearl Coffee",
              industry: "specialty coffee",
              location: "Manama, Bahrain"
            }
          }
        ]
      }
    });
    await prisma.usageCounter.create({
      data: {
        workspaceId: session.workspace.id,
        metric: "CAMPAIGN",
        periodStart,
        periodEnd: monthEnd(periodStart),
        used: 1,
        limit: 1
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/campaigns/generate",
      headers,
      payload: {
        durationDays: 14,
        startsAt: "2026-09-01T00:00:00.000Z"
      }
    });
    const aiCounter = await prisma.usageCounter.findUnique({
      where: {
        workspaceId_metric_periodStart: {
          workspaceId: session.workspace.id,
          metric: "AI_GENERATION",
          periodStart
        }
      }
    });

    expect(response.statusCode).toBe(402);
    expect(response.json()).toMatchObject({
      error: {
        code: "USAGE_QUOTA_EXCEEDED",
        details: [
          {
            metric: "CAMPAIGN"
          }
        ]
      }
    });
    expect(aiCounter?.used ?? 0n).toBe(0n);

    await app.close();
  });

  it("blocks campaign generation when the trial has expired", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    await app.inject({
      method: "PUT",
      url: "/v1/vault/company",
      headers,
      payload: {
        entries: [
          {
            key: "profile",
            value: {
              name: "Pearl Coffee",
              industry: "specialty coffee",
              location: "Manama, Bahrain"
            }
          }
        ]
      }
    });
    await prisma.user.update({
      data: {
        planStatus: "TRIAL",
        trialEndsAt: new Date(Date.now() - 60 * 1000)
      },
      where: {
        id: session.user.id
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/campaigns/generate",
      headers,
      payload: {
        durationDays: 14,
        startsAt: "2026-09-01T00:00:00.000Z"
      }
    });

    expect(response.statusCode).toBe(402);
    expect(response.json()).toMatchObject({
      error: {
        code: "BILLING_STATUS_INACTIVE",
        details: [
          {
            status: "TRIAL"
          }
        ]
      }
    });

    await app.close();
  });
});

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = `campaign-${randomUUID()}@markos.test`;
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

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthEnd(periodStart: Date): Date {
  return new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1));
}
