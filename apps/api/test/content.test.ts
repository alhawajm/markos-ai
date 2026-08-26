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
  it("reads a filtered Calendar range with isolated placed content, referenced media, and paginated Unscheduled items", async () => {
    const app = await buildApp();
    const owner = await registerTestUser(app);
    const other = await registerTestUser(app);
    const headers = authHeaders(owner.tokens.accessToken);
    const ids = {
      plannedDraft: randomUUID(),
      plannedReady: randomUUID(),
      scheduled: randomUUID(),
      published: randomUUID(),
      failed: randomUUID(),
      outside: randomUUID(),
      unscheduledFirst: randomUUID(),
      unscheduledSecond: randomUUID(),
      otherWorkspace: randomUUID()
    };
    const media = await prisma.mediaAsset.create({
      data: {
        workspaceId: owner.workspace.id,
        type: "IMAGE",
        filename: "calendar-reference.jpg",
        s3Key: "external:https://example.com/calendar-reference.jpg",
        cdnUrl: "https://example.com/calendar-reference.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024
      }
    });
    const base = {
      hashtags: [],
      mediaIds: [] as string[],
      workspaceId: owner.workspace.id
    };

    await Promise.all([
      prisma.contentItem.create({
        data: {
          ...base,
          id: ids.plannedDraft,
          contentType: "POST",
          status: "DRAFT",
          captionEn: "Planned draft",
          plannedAt: new Date("2026-08-10T09:00:00+03:00")
        }
      }),
      prisma.contentItem.create({
        data: {
          ...base,
          id: ids.plannedReady,
          contentType: "CAROUSEL",
          status: "APPROVED",
          captionEn: "Planned ready carousel",
          mediaIds: [media.id],
          plannedAt: new Date("2026-08-11T10:00:00+03:00")
        }
      }),
      prisma.contentItem.create({
        data: {
          ...base,
          id: ids.scheduled,
          contentType: "REEL",
          status: "SCHEDULED",
          captionEn: "Scheduled reel",
          scheduledAt: new Date("2026-08-27T11:00:00+03:00")
        }
      }),
      prisma.contentItem.create({
        data: {
          ...base,
          id: ids.published,
          contentType: "STORY",
          status: "PUBLISHED",
          captionEn: "Published story",
          publishedAt: new Date("2026-08-13T12:00:00+03:00")
        }
      }),
      prisma.contentItem.create({
        data: {
          ...base,
          id: ids.failed,
          contentType: "POST",
          status: "FAILED",
          captionEn: "Failed post",
          scheduledAt: new Date("2026-08-14T13:00:00+03:00"),
          failureReason: "Provider rejected the test post"
        }
      }),
      prisma.contentItem.create({
        data: {
          ...base,
          id: ids.outside,
          contentType: "POST",
          status: "SCHEDULED",
          captionEn: "Outside range",
          scheduledAt: new Date("2026-09-02T09:00:00+03:00")
        }
      }),
      prisma.contentItem.create({
        data: {
          ...base,
          id: ids.unscheduledFirst,
          contentType: "CAROUSEL",
          status: "APPROVED",
          captionEn: "First unscheduled carousel",
          updatedAt: new Date("2026-08-25T12:00:00+03:00")
        }
      }),
      prisma.contentItem.create({
        data: {
          ...base,
          id: ids.unscheduledSecond,
          contentType: "CAROUSEL",
          status: "APPROVED",
          captionEn: "Second unscheduled carousel",
          updatedAt: new Date("2026-08-24T12:00:00+03:00")
        }
      }),
      prisma.contentItem.create({
        data: {
          hashtags: [],
          mediaIds: [],
          workspaceId: other.workspace.id,
          id: ids.otherWorkspace,
          contentType: "POST",
          status: "SCHEDULED",
          captionEn: "Other workspace item",
          scheduledAt: new Date("2026-08-15T09:00:00+03:00")
        }
      })
    ]);

    const page = await app.inject({
      method: "GET",
      url: "/v1/calendar?from=2026-08-01&to=2026-08-31&unscheduledLimit=1",
      headers
    });
    const pageData = page.json().data;

    expect(page.statusCode).toBe(200);
    expect(pageData.items.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining([ids.plannedDraft, ids.plannedReady, ids.scheduled, ids.published, ids.failed])
    );
    expect(pageData.items.map((item: { id: string }) => item.id)).not.toEqual(expect.arrayContaining([ids.outside, ids.otherWorkspace]));
    expect(pageData.mediaAssets).toEqual([expect.objectContaining({ id: media.id, workspaceId: owner.workspace.id })]);
    expect(pageData.unscheduled).toMatchObject({ total: 2, nextOffset: 1 });
    expect(pageData.unscheduled.items).toHaveLength(1);
    expect(pageData.summary).toMatchObject({ ready: 3, needsAttention: 1 });
    expect(pageData.summary.scheduledThisWeek).toEqual(expect.any(Number));

    const filteredPage = await app.inject({
      method: "GET",
      url: "/v1/calendar?from=2026-08-01&to=2026-08-31&statuses=APPROVED&contentTypes=CAROUSEL&unscheduledOffset=1&unscheduledLimit=1",
      headers
    });
    const filteredData = filteredPage.json().data;

    expect(filteredPage.statusCode).toBe(200);
    expect(filteredData.items).toEqual([expect.objectContaining({ id: ids.plannedReady, status: "APPROVED", contentType: "CAROUSEL" })]);
    expect(filteredData.unscheduled).toMatchObject({ total: 2 });
    expect(filteredData.unscheduled.items).toEqual([expect.objectContaining({ id: ids.unscheduledSecond })]);
    expect(filteredData.unscheduled.nextOffset).toBeUndefined();
    expect(filteredData.summary.ready).toBe(3);

    const invalid = await app.inject({
      method: "GET",
      url: "/v1/calendar?from=2026-08-31&to=2026-08-01&statuses=READY",
      headers
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe("VALIDATION_ERROR");

    await app.close();
  });

  it("creates a workspace-owned blank draft without Vault context or AI usage", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const response = await app.inject({
      method: "POST",
      url: "/v1/content",
      headers: authHeaders(session.tokens.accessToken),
      payload: {}
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        workspaceId: session.workspace.id,
        contentType: "POST",
        status: "DRAFT",
        hashtags: [],
        mediaIds: []
      }
    });
    await expect(
      prisma.contentItem.findMany({
        where: {
          workspaceId: session.workspace.id,
          deletedAt: null
        }
      })
    ).resolves.toHaveLength(1);
    await expect(prisma.aiInteraction.count({ where: { workspaceId: session.workspace.id } })).resolves.toBe(0);
    await expect(prisma.usageCounter.count({ where: { workspaceId: session.workspace.id } })).resolves.toBe(0);

    await app.close();
  });

  it("creates a populated manual draft atomically with an optional planned publication time", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const plannedAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const response = await app.inject({
      method: "POST",
      url: "/v1/content",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        callToAction: "Send us a message.",
        captionAr: "مسودة يدوية",
        captionEn: "Manual draft",
        contentType: "POST",
        hashtags: ["#Manual", "#Bahrain"],
        plannedAt
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        callToAction: "Send us a message.",
        captionAr: "مسودة يدوية",
        captionEn: "Manual draft",
        contentType: "POST",
        hashtags: ["#Manual", "#Bahrain"],
        plannedAt,
        status: "DRAFT",
        workspaceId: session.workspace.id
      }
    });
    await expect(prisma.aiInteraction.count({ where: { workspaceId: session.workspace.id } })).resolves.toBe(0);

    await app.close();
  });

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
      used: 2n,
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
      used: 55n
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
      used: 89n
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
    expect(counter.used).toBe(99n);

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
      used: 0n
    });

    await app.close();
  });

  it("updates drafts and enforces the approval workflow", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const created = await createDraftContent(app, headers);
    const itemId = created.id;
    const plannedAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    const update = await app.inject({
      method: "PATCH",
      url: `/v1/content/${itemId}`,
      headers,
      payload: {
        captionEn: "Edited English caption",
        captionAr: "Edited Arabic caption",
        hashtags: ["#Edited", "#Bahrain"],
        callToAction: "Book a tasting.",
        contentPillar: "Lead generation",
        plannedAt
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
        contentPillar: "Lead generation",
        plannedAt
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
        captionEn: "Cross workspace edit",
        plannedAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("CONTENT_NOT_FOUND");

    await app.close();
  });

  it("soft-deletes workspace drafts only after scheduled publishing is cancelled", async () => {
    const app = await buildApp();
    const ownerSession = await registerTestUser(app);
    const ownerHeaders = authHeaders(ownerSession.tokens.accessToken);
    const otherSession = await registerTestUser(app);
    const created = await createDraftContent(app, ownerHeaders);
    const media = await prisma.mediaAsset.create({
      data: {
        workspaceId: ownerSession.workspace.id,
        type: "IMAGE",
        filename: "kept-in-library.jpg",
        s3Key: "external:https://cdn.example.com/kept-in-library.jpg",
        cdnUrl: "https://cdn.example.com/kept-in-library.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 120000,
        width: 1080,
        height: 1080
      }
    });
    await prisma.contentItem.update({ where: { id: created.id }, data: { mediaIds: [media.id] } });
    await app.inject({ method: "POST", url: `/v1/content/${created.id}/status`, headers: ownerHeaders, payload: { status: "IN_REVIEW" } });
    await app.inject({ method: "POST", url: `/v1/content/${created.id}/status`, headers: ownerHeaders, payload: { status: "APPROVED" } });
    await app.inject({
      method: "POST",
      url: `/v1/content/${created.id}/schedule`,
      headers: ownerHeaders,
      payload: { scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }
    });

    const crossWorkspace = await app.inject({
      method: "DELETE",
      url: `/v1/content/${created.id}`,
      headers: authHeaders(otherSession.tokens.accessToken)
    });
    const scheduledDelete = await app.inject({ method: "DELETE", url: `/v1/content/${created.id}`, headers: ownerHeaders });
    await app.inject({ method: "POST", url: `/v1/content/${created.id}/unschedule`, headers: ownerHeaders, payload: {} });
    const deleted = await app.inject({ method: "DELETE", url: `/v1/content/${created.id}`, headers: ownerHeaders });
    const listed = await app.inject({ method: "GET", url: "/v1/content", headers: ownerHeaders });

    expect(crossWorkspace.statusCode).toBe(404);
    expect(scheduledDelete.statusCode).toBe(409);
    expect(scheduledDelete.json().error.code).toBe("CONTENT_DELETE_REQUIRES_CANCELLATION");
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ data: { id: created.id } });
    expect(listed.json().data).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id })]));
    await expect(prisma.contentItem.findUniqueOrThrow({ where: { id: created.id } })).resolves.toMatchObject({ deletedAt: expect.any(Date) });
    await expect(prisma.mediaAsset.findUniqueOrThrow({ where: { id: media.id } })).resolves.toMatchObject({ deletedAt: null });

    await app.close();
  });

  it("does not treat published Instagram content as a deletable draft", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const created = await createDraftContent(app, headers);
    await prisma.contentItem.update({ where: { id: created.id }, data: { status: "PUBLISHED", instagramPostId: "instagram-post-id" } });

    const response = await app.inject({ method: "DELETE", url: `/v1/content/${created.id}`, headers });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("CONTENT_DELETE_FORBIDDEN");
    await expect(prisma.contentItem.findUniqueOrThrow({ where: { id: created.id } })).resolves.toMatchObject({ deletedAt: null });

    await app.close();
  });

  it("schedules approved content and records it in the monthly calendar", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const created = await createDraftContent(app, headers);
    const plannedAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await app.inject({
      method: "PATCH",
      url: `/v1/content/${created.id}`,
      headers,
      payload: { plannedAt }
    });

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
        plannedAt,
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
    expect(unschedule.json().data.plannedAt).toBeUndefined();
    expect(unschedule.json().data.scheduledAt).toBeUndefined();

    await app.close();
  });

  it("reschedules scheduled or failed content atomically and moves its monthly calendar index", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const created = await createDraftContent(app, headers);
    const originalDate = new Date();
    originalDate.setUTCMonth(originalDate.getUTCMonth() + 1, 5);
    originalDate.setUTCHours(15, 0, 0, 0);
    const movedDate = new Date(originalDate);
    movedDate.setUTCMonth(movedDate.getUTCMonth() + 1, 7);
    const originalScheduledAt = originalDate.toISOString();
    const movedScheduledAt = movedDate.toISOString();

    await app.inject({
      method: "POST",
      url: `/v1/content/${created.id}/status`,
      headers,
      payload: { status: "IN_REVIEW" }
    });
    await app.inject({
      method: "POST",
      url: `/v1/content/${created.id}/status`,
      headers,
      payload: { status: "APPROVED" }
    });
    await app.inject({
      method: "POST",
      url: `/v1/content/${created.id}/schedule`,
      headers,
      payload: { scheduledAt: originalScheduledAt }
    });

    const otherSession = await registerTestUser(app);
    const crossWorkspaceResponse = await app.inject({
      method: "POST",
      url: `/v1/content/${created.id}/reschedule`,
      headers: authHeaders(otherSession.tokens.accessToken),
      payload: { scheduledAt: movedScheduledAt }
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/content/${created.id}/reschedule`,
      headers,
      payload: { scheduledAt: movedScheduledAt }
    });
    const recoveredDate = new Date(movedDate);
    recoveredDate.setUTCDate(recoveredDate.getUTCDate() + 1);
    const recoveredScheduledAt = recoveredDate.toISOString();
    await prisma.contentItem.update({
      where: { id: created.id },
      data: { failureReason: "Provider processing failed", status: "FAILED" }
    });
    const recoveryResponse = await app.inject({
      method: "POST",
      url: `/v1/content/${created.id}/reschedule`,
      headers,
      payload: { scheduledAt: recoveredScheduledAt }
    });
    const originalCalendar = await prisma.contentCalendar.findFirstOrThrow({
      where: { month: monthStart(originalDate), workspaceId: session.workspace.id }
    });
    const movedCalendar = await prisma.contentCalendar.findFirstOrThrow({
      where: { month: monthStart(movedDate), workspaceId: session.workspace.id }
    });

    expect(crossWorkspaceResponse.statusCode).toBe(404);
    expect(crossWorkspaceResponse.json().error.code).toBe("CONTENT_NOT_FOUND");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        id: created.id,
        scheduledAt: movedScheduledAt,
        status: "SCHEDULED"
      }
    });
    expect(response.json().data.failureReason).toBeUndefined();
    expect(recoveryResponse.statusCode).toBe(200);
    expect(recoveryResponse.json()).toMatchObject({
      data: {
        id: created.id,
        scheduledAt: recoveredScheduledAt,
        status: "SCHEDULED"
      }
    });
    expect(recoveryResponse.json().data.failureReason).toBeUndefined();
    expect(originalCalendar.plan).toMatchObject({ scheduledContentIds: [] });
    expect(movedCalendar.plan).toMatchObject({ scheduledContentIds: [created.id] });

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
      used: 55n
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
      used: 89n
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
