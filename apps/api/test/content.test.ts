import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

const contentMock = vi.hoisted(() => ({
  lastInput: undefined as
    | {
        context: Array<{ key: string; section: string }>;
        contentType: string;
        count: number;
        toneLock: { requiredLanguages: ["ar", "en"]; toneWords: string[]; voiceNotes?: string };
        topic: string;
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

vi.mock("../src/ai/content-client", () => ({
  generateContentDrafts: async (input: NonNullable<typeof contentMock.lastInput>) => {
    contentMock.lastInput = input;

    return {
      model: "test-content-model",
      prompt_version: "content.v1.test",
      tokens_in: 55,
      tokens_out: 89,
      drafts: Array.from({ length: input.count }, (_, index) => ({
        contentType: input.contentType,
        captionEn: `English caption ${index + 1} for ${input.topic} using ${input.toneLock.toneWords.join(", ") || "clear"} tone`,
        captionAr: `Arabic caption ${index + 1} for ${input.topic} using ${input.toneLock.toneWords.join(", ") || "clear"} tone`,
        hashtags: ["#BahrainBusiness", "#MarkosAI"],
        callToAction: "Send a DM.",
        contentPillar: "Proof and trust",
        ...(input.contentType === "CAROUSEL" ? { carousel: { slides: [{ title: "Hook" }] } } : {})
      }))
    };
  }
}));

describe("content routes", () => {
  it("requires Vault context before generating content", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const response = await app.inject({
      method: "POST",
      url: "/v1/content/generate",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        topic: "wholesale coffee leads",
        contentType: "POST",
        count: 1
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: "CONTENT_CONTEXT_MISSING"
      }
    });

    await app.close();
  });

  it("generates Vault-grounded draft content and meters the interaction", async () => {
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
      url: "/v1/content/generate",
      headers,
      payload: {
        topic: "wholesale coffee leads",
        contentType: "CAROUSEL",
        count: 2
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [
        {
          workspaceId: session.workspace.id,
          contentType: "CAROUSEL",
          status: "DRAFT",
          captionEn: "English caption 1 for wholesale coffee leads using clear tone",
          captionAr: "Arabic caption 1 for wholesale coffee leads using clear tone",
          hashtags: ["#BahrainBusiness", "#MarkosAI"],
          callToAction: "Send a DM.",
          contentPillar: "Proof and trust",
          carousel: {
            slides: [
              {
                title: "Hook"
              }
            ]
          }
        },
        {
          workspaceId: session.workspace.id,
          contentType: "CAROUSEL",
          status: "DRAFT"
        }
      ]
    });

    const interaction = await prisma.aiInteraction.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id,
        agent: "CONTENT"
      }
    });
    const list = await app.inject({
      method: "GET",
      url: "/v1/content",
      headers
    });

    expect(interaction).toMatchObject({
      promptVersion: "content.v1.test",
      tokensIn: 55,
      tokensOut: 89,
      costMinor: 0,
      currency: "BHD",
      model: "test-content-model"
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
      used: 2,
      limit: 100
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
      used: 55
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
      used: 89
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(2);

    await app.close();
  });

  it("locks generated content to bilingual brand tone from the Vault", async () => {
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
    await app.inject({
      method: "PUT",
      url: "/v1/vault/brand",
      headers,
      payload: {
        entries: [
          {
            key: "identity",
            value: {
              colors: ["#123456"],
              fonts: ["Inter"],
              aestheticWords: ["premium", "local"]
            }
          }
        ]
      }
    });
    await app.inject({
      method: "PUT",
      url: "/v1/vault/tone",
      headers,
      payload: {
        entries: [
          {
            key: "voice",
            value: {
              toneWords: ["warm", "clear", "confident"],
              voiceNotes: "Helpful, bilingual, and direct."
            }
          }
        ]
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/content/generate",
      headers,
      payload: {
        topic: "wholesale coffee leads",
        contentType: "POST",
        count: 1
      }
    });
    const interaction = await prisma.aiInteraction.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id,
        agent: "CONTENT"
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [
        {
          captionEn: "English caption 1 for wholesale coffee leads using warm, clear, confident tone",
          captionAr: "Arabic caption 1 for wholesale coffee leads using warm, clear, confident tone"
        }
      ]
    });
    expect(contentMock.lastInput).toMatchObject({
      toneLock: {
        requiredLanguages: ["ar", "en"],
        toneWords: ["warm", "clear", "confident"],
        voiceNotes: "Helpful, bilingual, and direct."
      },
      context: expect.arrayContaining([
        expect.objectContaining({ section: "BRAND", key: "identity" }),
        expect.objectContaining({ section: "TONE", key: "voice" })
      ])
    });
    expect(interaction.prompt).toMatchObject({
      toneLock: {
        requiredLanguages: ["ar", "en"],
        toneWords: ["warm", "clear", "confident"],
        voiceNotes: "Helpful, bilingual, and direct."
      },
      retrievedContext: expect.arrayContaining([
        expect.objectContaining({ section: "BRAND", key: "identity" }),
        expect.objectContaining({ section: "TONE", key: "voice" })
      ])
    });

    await app.close();
  });

  it("blocks content generation when the AI generation quota is exhausted", async () => {
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
        metric: "AI_GENERATION",
        periodStart,
        periodEnd: monthEnd(periodStart),
        used: 99,
        limit: 100
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/content/generate",
      headers,
      payload: {
        topic: "wholesale coffee leads",
        contentType: "POST",
        count: 2
      }
    });
    const counter = await prisma.usageCounter.findUniqueOrThrow({
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
            metric: "AI_GENERATION"
          }
        ]
      }
    });
    expect(counter.used).toBe(99);

    await app.close();
  });

  it("blocks content generation when billing is suspended", async () => {
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
        planStatus: "SUSPENDED"
      },
      where: {
        id: session.user.id
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/content/generate",
      headers,
      payload: {
        topic: "wholesale coffee leads",
        contentType: "POST",
        count: 1
      }
    });

    expect(response.statusCode).toBe(402);
    expect(response.json()).toMatchObject({
      error: {
        code: "BILLING_STATUS_INACTIVE",
        details: [
          {
            status: "SUSPENDED"
          }
        ]
      }
    });

    await app.close();
  });

  it("blocks generated content when AI token usage exceeds the plan quota and refunds the generation reservation", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const periodStart = monthStart(new Date());
    await assignTokenLimitedPlan(session.user.id);

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
      url: "/v1/content/generate",
      headers,
      payload: {
        topic: "token quota proof",
        contentType: "POST",
        count: 1
      }
    });

    expect(response.statusCode).toBe(402);
    expect(response.json()).toMatchObject({
      error: {
        code: "USAGE_QUOTA_EXCEEDED",
        details: [
          {
            metric: "AI_TOKENS_OUT"
          }
        ]
      }
    });
    await expect(
      prisma.contentItem.findMany({
        where: {
          workspaceId: session.workspace.id,
          captionEn: {
            contains: "token quota proof"
          }
        }
      })
    ).resolves.toHaveLength(0);
    await expect(
      prisma.aiInteraction.findMany({
        where: {
          workspaceId: session.workspace.id
        }
      })
    ).resolves.toHaveLength(0);
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
      used: 0
    });

    await app.close();
  });

  it("updates drafts and enforces the approval workflow", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const created = await createDraftContent(app, headers);
    const itemId = created.id;

    const update = await app.inject({
      method: "PATCH",
      url: `/v1/content/${itemId}`,
      headers,
      payload: {
        captionEn: "Edited English caption",
        captionAr: "Edited Arabic caption",
        hashtags: ["#Edited", "#Bahrain"],
        callToAction: "Book a tasting.",
        contentPillar: "Lead generation"
      }
    });

    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({
      data: {
        id: itemId,
        status: "DRAFT",
        captionEn: "Edited English caption",
        hashtags: ["#Edited", "#Bahrain"],
        callToAction: "Book a tasting.",
        contentPillar: "Lead generation"
      }
    });

    const review = await app.inject({
      method: "POST",
      url: `/v1/content/${itemId}/status`,
      headers,
      payload: {
        status: "IN_REVIEW"
      }
    });
    const approved = await app.inject({
      method: "POST",
      url: `/v1/content/${itemId}/status`,
      headers,
      payload: {
        status: "APPROVED"
      }
    });
    const lockedEdit = await app.inject({
      method: "PATCH",
      url: `/v1/content/${itemId}`,
      headers,
      payload: {
        captionEn: "Should not save"
      }
    });
    const invalidTransition = await app.inject({
      method: "POST",
      url: `/v1/content/${itemId}/status`,
      headers,
      payload: {
        status: "IN_REVIEW"
      }
    });

    expect(review.statusCode).toBe(200);
    expect(review.json().data.status).toBe("IN_REVIEW");
    expect(approved.statusCode).toBe(200);
    expect(approved.json().data.status).toBe("APPROVED");
    expect(lockedEdit.statusCode).toBe(409);
    expect(lockedEdit.json().error.code).toBe("CONTENT_LOCKED");
    expect(invalidTransition.statusCode).toBe(409);
    expect(invalidTransition.json().error.code).toBe("CONTENT_STATUS_TRANSITION_INVALID");

    await app.close();
  });

  it("does not allow another workspace to edit a content item", async () => {
    const app = await buildApp();
    const ownerSession = await registerTestUser(app);
    const ownerHeaders = authHeaders(ownerSession.tokens.accessToken);
    const otherSession = await registerTestUser(app);
    const otherHeaders = authHeaders(otherSession.tokens.accessToken);
    const created = await createDraftContent(app, ownerHeaders);

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/content/${created.id}`,
      headers: otherHeaders,
      payload: {
        captionEn: "Cross workspace edit"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("CONTENT_NOT_FOUND");

    await app.close();
  });

  it("schedules approved content and records it in the monthly calendar", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const created = await createDraftContent(app, headers);
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const draftSchedule = await app.inject({
      method: "POST",
      url: `/v1/content/${created.id}/schedule`,
      headers,
      payload: {
        scheduledAt
      }
    });

    await app.inject({
      method: "POST",
      url: `/v1/content/${created.id}/status`,
      headers,
      payload: {
        status: "IN_REVIEW"
      }
    });
    await app.inject({
      method: "POST",
      url: `/v1/content/${created.id}/status`,
      headers,
      payload: {
        status: "APPROVED"
      }
    });

    const schedule = await app.inject({
      method: "POST",
      url: `/v1/content/${created.id}/schedule`,
      headers,
      payload: {
        scheduledAt
      }
    });
    const calendar = await prisma.contentCalendar.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id
      }
    });
    const unschedule = await app.inject({
      method: "POST",
      url: `/v1/content/${created.id}/unschedule`,
      headers,
      payload: {}
    });

    expect(draftSchedule.statusCode).toBe(409);
    expect(draftSchedule.json().error.code).toBe("CONTENT_SCHEDULE_INVALID");
    expect(schedule.statusCode).toBe(200);
    expect(schedule.json()).toMatchObject({
      data: {
        id: created.id,
        status: "SCHEDULED",
        scheduledAt
      }
    });
    expect(calendar.plan).toMatchObject({
      scheduledContentIds: [created.id]
    });
    expect(unschedule.statusCode).toBe(200);
    expect(unschedule.json()).toMatchObject({
      data: {
        id: created.id,
        status: "APPROVED"
      }
    });
    expect(unschedule.json().data.scheduledAt).toBeUndefined();

    await app.close();
  });

  it("generates content directly from a calendar slot and records the schedule", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
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
      url: "/v1/content/generate-for-slot",
      headers,
      payload: {
        topic: "wholesale coffee leads",
        contentType: "REEL",
        scheduledAt
      }
    });
    const item = response.json().data as { id: string };
    const calendar = await prisma.contentCalendar.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id
      }
    });
    const interaction = await prisma.aiInteraction.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id,
        agent: "CONTENT"
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        workspaceId: session.workspace.id,
        contentType: "REEL",
        status: "SCHEDULED",
        scheduledAt,
        captionEn: "English caption 1 for wholesale coffee leads using clear tone",
        captionAr: "Arabic caption 1 for wholesale coffee leads using clear tone"
      }
    });
    expect(calendar.plan).toMatchObject({
      scheduledContentIds: [item.id]
    });
    expect(interaction.prompt).toMatchObject({
      topic: "wholesale coffee leads",
      contentType: "REEL",
      count: 1,
      scheduledAt
    });
    expect(interaction.response).toMatchObject({
      scheduledContentItemId: item.id
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
      used: 1,
      limit: 100
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
      used: 55
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
      used: 89
    });

    await app.close();
  });

  it("rejects calendar slot generation when the schedule time is not in the future", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    const response = await app.inject({
      method: "POST",
      url: "/v1/content/generate-for-slot",
      headers,
      payload: {
        topic: "wholesale coffee leads",
        contentType: "POST",
        scheduledAt: new Date(Date.now() - 60 * 1000).toISOString()
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("CONTENT_SCHEDULE_INVALID");

    await app.close();
  });
});

async function createDraftContent(app: Awaited<ReturnType<typeof buildApp>>, headers: Record<string, string>) {
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
    url: "/v1/content/generate",
    headers,
    payload: {
      topic: "wholesale coffee leads",
      contentType: "POST",
      count: 1
    }
  });

  return response.json().data[0];
}

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = `content-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password: "CorrectHorseBattery99!",
      fullName: "Content User",
      workspaceName: `Content Workspace ${randomUUID()}`,
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


async function assignTokenLimitedPlan(userId: string): Promise<void> {
  const plan = await prisma.plan.create({
    data: {
      active: true,
      code: `CONTENT_TOKEN_LIMIT_${randomUUID()}`,
      currency: "BHD",
      limits: {
        aiGenerations: 100,
        aiImages: 20,
        aiInputTokens: 1_000,
        aiOutputTokens: 10,
        posts: 30,
        seats: 1,
        storageBytes: 1_000_000_000,
        strategies: 1,
        workspaces: 1
      },
      name: "Content Token Limit Plan",
      priceMinor: 1000
    }
  });

  await prisma.user.update({
    data: {
      planId: plan.id,
      planStatus: "ACTIVE",
      trialEndsAt: null
    },
    where: {
      id: userId
    }
  });
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
