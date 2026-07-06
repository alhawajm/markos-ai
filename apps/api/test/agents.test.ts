import { randomUUID } from "node:crypto";
import { agentNames, type AnalyticsSummary } from "@markos/shared-types";
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

vi.mock("../src/ai/agent-client", () => ({
  runAiAgent: async (input: { agent: string; context: unknown[]; inputs?: Record<string, unknown>; locale: string; task: string }) => {
    const analyticsSummary = input.inputs?.analyticsSummary as AnalyticsSummary | undefined;

    return {
      model: "test-agent-model",
      prompt_version: `${input.agent.toLowerCase()}.v1.test`,
      tokens_in: 77,
      tokens_out: 123,
      output: {
        agent: input.agent,
        task: input.task,
        locale: input.locale,
        groundingCount: input.context.length,
        analyticsReach: analyticsSummary?.totals.reach ?? null,
        summary: `${input.agent} grounded output`
      }
    };
  }
}));

describe("agent routes", () => {
  it("requires Vault context before running an agent", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const response = await app.inject({
      method: "POST",
      url: "/v1/agents/run",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        agent: "CONTENT_PLANNER",
        task: "build next month calendar",
        locale: "en"
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: "AGENT_CONTEXT_MISSING"
      }
    });

    await app.close();
  });

  it("runs all eight agents with Vault grounding and AI generation metering", async () => {
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

    for (const agent of agentNames) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/agents/run",
        headers,
        payload: {
          agent,
          task: `run ${agent.toLowerCase()} for wholesale coffee leads`,
          locale: "en"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        data: {
          workspaceId: session.workspace.id,
          agent,
          promptVersion: `${agent.toLowerCase()}.v1.test`,
          request: {
            retrievedContext: [
              expect.objectContaining({
                section: "COMPANY",
                key: "profile"
              })
            ]
          },
          output: {
            agent,
            groundingCount: 1
          },
          tokensIn: 77,
          tokensOut: 123,
          model: "test-agent-model"
        }
      });
    }

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
      used: agentNames.length,
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
      used: 77 * agentNames.length
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
      used: 123 * agentNames.length
    });
    await expect(
      prisma.aiInteraction.groupBy({
        by: ["agent"],
        where: {
          workspaceId: session.workspace.id,
          agent: {
            in: [...agentNames]
          }
        }
      })
    ).resolves.toHaveLength(agentNames.length);

    await app.close();
  });

  it("grounds Analytics Consultant runs with stored Instagram analytics", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const content = await prisma.contentItem.create({
      data: {
        captionEn: "Analytics proof post",
        contentType: "POST",
        hashtags: ["#MarkosAI"],
        instagramPostId: `ig-${randomUUID()}`,
        mediaIds: [],
        publishedAt: new Date(),
        status: "PUBLISHED",
        workspaceId: session.workspace.id
      }
    });

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
              name: "Pearl Coffee"
            }
          }
        ]
      }
    });
    await prisma.instagramAnalytics.create({
      data: {
        contentItemId: content.id,
        dataDate: dayStart(new Date()),
        metricType: "POST",
        metrics: {
          comments: 5,
          likes: 20,
          reach: 300,
          saves: 3,
          shares: 2
        },
        syncedAt: new Date(),
        workspaceId: session.workspace.id
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/agents/run",
      headers,
      payload: {
        agent: "ANALYTICS_CONSULTANT",
        task: "explain the last 30 days of performance",
        locale: "en"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        request: {
          inputs: {
            analyticsSummary: {
              totals: {
                comments: 5,
                engagement: 30,
                likes: 20,
                reach: 300,
                saves: 3,
                shares: 2
              },
              topContent: [
                expect.objectContaining({
                  caption: "Analytics proof post",
                  contentItemId: content.id,
                  engagement: 30
                })
              ]
            }
          }
        },
        output: {
          agent: "ANALYTICS_CONSULTANT",
          analyticsReach: 300,
          groundingCount: 1
        }
      }
    });

    await expect(
      prisma.aiInteraction.findFirstOrThrow({
        where: {
          agent: "ANALYTICS_CONSULTANT",
          workspaceId: session.workspace.id
        }
      })
    ).resolves.toMatchObject({
      workspaceId: session.workspace.id
    });

    await app.close();
  });
});

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = `agents-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password: "CorrectHorseBattery99!",
      fullName: "Agent User",
      workspaceName: `Agent Workspace ${randomUUID()}`,
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

function dayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
