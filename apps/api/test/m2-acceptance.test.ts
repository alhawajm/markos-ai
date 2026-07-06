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

vi.mock("../src/ai/strategy-client", () => ({
  generateStrategyPlan: async (input: { context: unknown[]; horizonDays: number; objective?: string; workspaceId: string }) => ({
    model: "test-strategy-model",
    prompt_version: "strategy.v1.m2",
    tokens_in: 100,
    tokens_out: 200,
    strategy: {
      summary: `${input.horizonDays}-day M2 plan for ${input.objective ?? "Instagram growth"}`,
      horizonDays: input.horizonDays,
      objectives: [input.objective ?? "grow qualified Instagram inquiries"],
      pillars: [
        {
          name: "Wholesale proof",
          rationale: "Grounded in Vault business memory",
          contentAngles: ["office coffee proof", "local Bahrain trust"]
        }
      ],
      weeklyCadence: [{ week: 1, focus: "Trust", actions: ["publish bilingual proof post"] }],
      kpis: [{ name: "qualified leads", target: "25" }],
      risks: ["generic content"],
      nextActions: ["review calendar item"]
    }
  })
}));

vi.mock("../src/ai/content-client", () => ({
  generateContentDrafts: async (input: NonNullable<typeof contentMock.lastInput>) => {
    contentMock.lastInput = input;

    return {
      model: "test-content-model",
      prompt_version: "content.v1.m2",
      tokens_in: 41,
      tokens_out: 59,
      drafts: [
        {
          contentType: input.contentType,
          captionEn: `English ${input.topic} using ${input.toneLock.toneWords.join(", ")} tone`,
          captionAr: `Arabic ${input.topic} using ${input.toneLock.toneWords.join(", ")} tone`,
          hashtags: ["#BahrainBusiness", "#PearlCoffee"],
          callToAction: "Send a DM for the office coffee menu.",
          contentPillar: "Wholesale proof"
        }
      ]
    };
  }
}));

vi.mock("../src/ai/image-client", () => ({
  generateImageAsset: async (input: { aspectRatio: string; prompt: string; workspaceId: string }) => {
    const bytes = Buffer.from(`<svg>${input.workspaceId}:${input.aspectRatio}:${input.prompt}</svg>`);

    return {
      base64_data: bytes.toString("base64"),
      filename: "m2-acceptance-image.svg",
      height: 1350,
      mime_type: "image/svg+xml",
      model: "test-image-model",
      prompt: input.prompt,
      prompt_version: "image.v1.m2",
      size_bytes: bytes.byteLength,
      tokens_in: 23,
      tokens_out: 11,
      width: 1080
    };
  }
}));

describe("M2 acceptance", () => {
  it("turns a calendar slot into bilingual tone-locked content with an AI image, workflow movement, and strategy PDF export", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const scheduledAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    const rescheduledAt = new Date(Date.now() + 28 * 60 * 60 * 1000).toISOString();
    const periodStart = monthStart(new Date());

    await seedVault(app, headers);

    const strategy = await app.inject({
      method: "POST",
      url: "/v1/strategy/generate",
      headers,
      payload: {
        objective: "increase wholesale office coffee leads",
        horizonDays: 90
      }
    });
    const strategyId = strategy.json().data.id as string;

    const generated = await app.inject({
      method: "POST",
      url: "/v1/content/generate-for-slot",
      headers,
      payload: {
        topic: "wholesale office coffee leads",
        contentType: "POST",
        strategyId,
        scheduledAt
      }
    });
    const content = generated.json().data as { id: string };

    const image = await app.inject({
      method: "POST",
      url: `/v1/content/${content.id}/generate-image`,
      headers,
      payload: {
        aspectRatio: "4:5",
        prompt: "Premium Bahrain office coffee setup with Pearl Coffee branding"
      }
    });
    const imageBody = image.json().data;

    const unscheduled = await app.inject({
      method: "POST",
      url: `/v1/content/${content.id}/unschedule`,
      headers,
      payload: {}
    });
    const draft = await app.inject({
      method: "POST",
      url: `/v1/content/${content.id}/status`,
      headers,
      payload: {
        status: "DRAFT"
      }
    });
    const review = await app.inject({
      method: "POST",
      url: `/v1/content/${content.id}/status`,
      headers,
      payload: {
        status: "IN_REVIEW"
      }
    });
    const approved = await app.inject({
      method: "POST",
      url: `/v1/content/${content.id}/status`,
      headers,
      payload: {
        status: "APPROVED"
      }
    });
    const rescheduled = await app.inject({
      method: "POST",
      url: `/v1/content/${content.id}/schedule`,
      headers,
      payload: {
        scheduledAt: rescheduledAt
      }
    });
    const pdf = await app.inject({
      method: "GET",
      url: `/v1/strategy/${strategyId}/pdf`,
      headers
    });
    const calendar = await prisma.contentCalendar.findFirstOrThrow({
      where: {
        month: monthStart(new Date(rescheduledAt)),
        workspaceId: session.workspace.id
      }
    });

    expect(strategy.statusCode).toBe(200);
    expect(generated.statusCode).toBe(200);
    expect(generated.json()).toMatchObject({
      data: {
        workspaceId: session.workspace.id,
        contentType: "POST",
        status: "SCHEDULED",
        scheduledAt,
        captionEn: "English wholesale office coffee leads using warm, clear, confident tone",
        captionAr: "Arabic wholesale office coffee leads using warm, clear, confident tone",
        contentPillar: "Wholesale proof"
      }
    });
    expect(contentMock.lastInput).toMatchObject({
      topic: "wholesale office coffee leads",
      toneLock: {
        requiredLanguages: ["ar", "en"],
        toneWords: ["warm", "clear", "confident"],
        voiceNotes: "Helpful, bilingual, and direct."
      },
      context: expect.arrayContaining([
        expect.objectContaining({ section: "COMPANY", key: "profile" }),
        expect.objectContaining({ section: "BRAND", key: "identity" }),
        expect.objectContaining({ section: "TONE", key: "voice" })
      ])
    });
    expect(image.statusCode).toBe(200);
    expect(imageBody).toMatchObject({
      contentItem: {
        id: content.id,
        mediaIds: [imageBody.mediaAsset.id]
      },
      mediaAsset: {
        type: "AI_GENERATED",
        filename: "m2-acceptance-image.svg",
        mimeType: "image/svg+xml",
        width: 1080,
        height: 1350
      },
      promptVersion: "image.v1.m2"
    });
    expect(unscheduled.json().data.status).toBe("APPROVED");
    expect(draft.json().data.status).toBe("DRAFT");
    expect(review.json().data.status).toBe("IN_REVIEW");
    expect(approved.json().data.status).toBe("APPROVED");
    expect(rescheduled.statusCode).toBe(200);
    expect(rescheduled.json()).toMatchObject({
      data: {
        id: content.id,
        status: "SCHEDULED",
        scheduledAt: rescheduledAt,
        mediaIds: [imageBody.mediaAsset.id]
      }
    });
    expect(calendar.plan).toMatchObject({
      scheduledContentIds: [content.id]
    });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.body).toContain("MARKOS AI Strategy Export");
    expect(pdf.body).toContain("90-day strategy: increase wholesale office coffee leads");
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
    ).resolves.toMatchObject({ used: 2 });
    await expect(
      prisma.usageCounter.findUniqueOrThrow({
        where: {
          workspaceId_metric_periodStart: {
            workspaceId: session.workspace.id,
            metric: "AI_IMAGE",
            periodStart
          }
        }
      })
    ).resolves.toMatchObject({ used: 1 });
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
    ).resolves.toMatchObject({ used: 164 });
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
    ).resolves.toMatchObject({ used: 270 });

    await app.close();
  });
});

async function seedVault(app: Awaited<ReturnType<typeof buildApp>>, headers: Record<string, string>): Promise<void> {
  const responses = await Promise.all([
    app.inject({
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
    }),
    app.inject({
      method: "PUT",
      url: "/v1/vault/brand",
      headers,
      payload: {
        entries: [
          {
            key: "identity",
            value: {
              colors: ["#0A2342", "#F95738"],
              fonts: ["Inter"],
              aestheticWords: ["premium", "local", "trustworthy"]
            }
          }
        ]
      }
    }),
    app.inject({
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
    })
  ]);

  for (const response of responses) {
    expect(response.statusCode).toBe(200);
  }
}

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = `m2-acceptance-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password: "CorrectHorseBattery99!",
      fullName: "M2 Acceptance User",
      workspaceName: `M2 Acceptance Workspace ${randomUUID()}`,
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

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
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
