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

vi.mock("../src/ai/strategy-client", () => ({
  generateStrategyPlan: async (input: { context: unknown[]; horizonDays: number; objective?: string; workspaceId: string }) => ({
    model: "test-strategy-model",
    prompt_version: "strategy.v1.test",
    tokens_in: 101,
    tokens_out: 202,
    strategy: {
      summary: `${input.horizonDays}-day plan for ${input.objective ?? "Instagram growth"}`,
      horizonDays: input.horizonDays,
      objectives: [input.objective ?? "grow qualified Instagram inquiries"],
      pillars: [
        {
          name: "Proof and trust",
          rationale: "Grounded in Vault context",
          contentAngles: ["customer outcomes", "process"]
        }
      ],
      weeklyCadence: [
        {
          week: 1,
          focus: "Message clarity",
          actions: ["publish intro carousel"]
        }
      ],
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

describe("strategy routes", () => {
  it("requires Vault context before generating strategy", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const response = await app.inject({
      method: "POST",
      url: "/v1/strategy/generate",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        horizonDays: 90
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: "STRATEGY_CONTEXT_MISSING"
      }
    });

    await app.close();
  });

  it("generates a Vault-grounded strategy and meters the interaction", async () => {
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
      url: "/v1/strategy/generate",
      headers,
      payload: {
        objective: "increase wholesale cafe leads",
        horizonDays: 90
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        workspaceId: session.workspace.id,
        title: "90-day strategy: increase wholesale cafe leads",
        horizonDays: 90,
        content: {
          summary: "90-day plan for increase wholesale cafe leads",
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
      url: "/v1/strategy",
      headers
    });

    expect(interaction).toMatchObject({
      promptVersion: "strategy.v1.test",
      tokensIn: 101,
      tokensOut: 202,
      costMinor: 0,
      currency: "BHD",
      model: "test-strategy-model"
    });
    await expect(
      prisma.usageCounter.findUniqueOrThrow({
        where: {
          workspaceId_metric_periodStart: {
            workspaceId: session.workspace.id,
            metric: "STRATEGY",
            periodStart
          }
        }
      })
    ).resolves.toMatchObject({
      used: 1,
      limit: 1
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
    expect(list.statusCode).toBe(200);
    expect(list.json().data[0]).toMatchObject({
      title: "90-day strategy: increase wholesale cafe leads"
    });

    await app.close();
  });

  it("blocks strategy generation when the plan quota is exhausted", async () => {
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
        metric: "STRATEGY",
        periodStart,
        periodEnd: monthEnd(periodStart),
        used: 1,
        limit: 1
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/strategy/generate",
      headers,
      payload: {
        horizonDays: 90
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
            metric: "STRATEGY"
          }
        ]
      }
    });
    expect(aiCounter?.used ?? 0).toBe(0);

    await app.close();
  });

  it("blocks strategy generation when the trial has expired", async () => {
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
      url: "/v1/strategy/generate",
      headers,
      payload: {
        horizonDays: 90
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
  const email = `strategy-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password: "CorrectHorseBattery99!",
      fullName: "Strategy User",
      workspaceName: `Strategy Workspace ${randomUUID()}`,
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

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthEnd(periodStart: Date): Date {
  return new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1));
}
