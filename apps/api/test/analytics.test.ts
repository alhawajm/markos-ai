import { randomUUID } from "node:crypto";
import type { AnalyticsSummary } from "@markos/shared-types";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { persistTestInstagramConnection } from "./helpers/instagram-connection";
import { MetaGraphInstagramAnalyticsProvider, type InstagramAnalyticsProvider } from "../src/analytics/instagram-analytics-provider";
import { syncInstagramAnalyticsForAllWorkspaces } from "../src/analytics/analytics-service";

vi.mock("../src/ai/embeddings-client", () => ({
  embedVaultTexts: async (texts: string[]) => ({
    dimensions: 1536,
    embeddings: texts.map(testEmbedding),
    model: "test-embedding-model"
  })
}));

vi.mock("../src/ai/agent-client", () => ({
  runAiAgent: async (input: { agent: string; inputs?: Record<string, unknown>; locale: string; task: string }) => {
    const analyticsSummary = input.inputs?.analyticsSummary as AnalyticsSummary | undefined;

    return {
      model: "test-agent-model",
      output: {
        analyticsDays: analyticsSummary?.days ?? null,
        format: input.inputs?.outputFormat,
        question: input.inputs?.question,
        reach: analyticsSummary?.totals.reach ?? 0,
        task: input.task
      },
      prompt_version: `${input.agent.toLowerCase()}.v1.test`,
      tokens_in: 40,
      tokens_out: 60
    };
  }
}));

describe("analytics routes", () => {
  it("reports live analytics readiness blockers before real Meta sync", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    await persistTestInstagramConnection({ workspaceId: session.workspace.id, actorId: session.user.id });

    const response = await app.inject({
      method: "GET",
      url: "/v1/analytics/live-readiness",
      headers
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        connection: {
          accountId: expect.any(String),
          connected: true
        },
        mode: "dry_run",
        ready: false,
        reasons: expect.arrayContaining(["INSTAGRAM_ANALYTICS_SYNC_MODE_NOT_LIVE"]),
        requiredEnv: expect.arrayContaining(["INSTAGRAM_ANALYTICS_SYNC_MODE", "META_APP_ID", "META_APP_SECRET"]),
        requiredScopes: expect.arrayContaining(["instagram_business_basic", "instagram_business_manage_insights"])
      }
    });

    await app.close();
  });

  it("syncs Instagram analytics for the active workspace and summarizes metrics", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const content = await createPublishedContent(session.workspace.id);

    await persistTestInstagramConnection({ workspaceId: session.workspace.id, actorId: session.user.id });

    const syncResponse = await app.inject({
      method: "POST",
      url: "/v1/analytics/sync",
      headers,
      payload: {
        days: 30
      }
    });
    const summaryResponse = await app.inject({
      method: "GET",
      url: "/v1/analytics?days=30",
      headers
    });

    expect(syncResponse.statusCode).toBe(200);
    expect(syncResponse.json()).toMatchObject({
      data: {
        created: 2,
        learning: {
          entry: {
            key: expect.stringContaining("analytics.performance."),
            section: "OBJECTIVES",
            workspaceId: session.workspace.id
          },
          observations: expect.arrayContaining([expect.stringContaining("Performance window captured")]),
          recordCount: 2,
          workspaceId: session.workspace.id
        },
        mode: "dry_run",
        records: expect.arrayContaining([
          expect.objectContaining({
            metricType: "ACCOUNT"
          }),
          expect.objectContaining({
            contentItemId: content.id,
            metricType: "POST"
          })
        ]),
        workspaceId: session.workspace.id
      }
    });
    expect(summaryResponse.statusCode).toBe(200);
    expect(summaryResponse.json().data.byMetricType).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricType: "ACCOUNT"
        }),
        expect.objectContaining({
          metricType: "POST"
        })
      ])
    );
    expect(summaryResponse.json().data.daily.length).toBeGreaterThan(0);
    expect(summaryResponse.json().data.topContent).toEqual([
      expect.objectContaining({
        caption: "Analytics post",
        contentItemId: content.id,
        contentType: "POST",
        engagement: expect.any(Number)
      })
    ]);
    expect(summaryResponse.json().data.totals.engagement).toBeGreaterThan(0);
    expect(summaryResponse.json().data.totals.followers).toBeGreaterThan(0);
    expect(summaryResponse.json().data.totals.likes).toBeGreaterThan(0);
    expect(summaryResponse.json().data.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceId: session.workspace.id
        })
      ])
    );

    const learningSearch = await app.inject({
      method: "POST",
      url: "/v1/vault/rag/search",
      headers,
      payload: {
        query: "Instagram analytics performance learning top content reach engagement",
        section: "OBJECTIVES",
        topK: 3
      }
    });

    expect(learningSearch.statusCode).toBe(200);
    expect(learningSearch.json().data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: expect.stringContaining("analytics.performance."),
          section: "OBJECTIVES",
          value: expect.objectContaining({
            kind: "ANALYTICS_PERFORMANCE_LEARNING"
          })
        })
      ])
    );

    await app.close();
  });

  it("does not leak analytics records across workspace boundaries", async () => {
    const app = await buildApp();
    const first = await registerTestUser(app);
    const second = await registerTestUser(app);
    const firstHeaders = authHeaders(first.tokens.accessToken);
    const secondHeaders = authHeaders(second.tokens.accessToken);

    await persistTestInstagramConnection({ workspaceId: first.workspace.id, actorId: first.user.id });
    await persistTestInstagramConnection({ workspaceId: second.workspace.id, actorId: second.user.id });
    await createPublishedContent(first.workspace.id);
    await createPublishedContent(second.workspace.id);

    await app.inject({
      method: "POST",
      url: "/v1/analytics/sync",
      headers: firstHeaders,
      payload: {
        days: 30
      }
    });

    const firstSummary = await app.inject({
      method: "GET",
      url: "/v1/analytics?days=30",
      headers: firstHeaders
    });
    const secondSummary = await app.inject({
      method: "GET",
      url: "/v1/analytics?days=30",
      headers: secondHeaders
    });

    expect(firstSummary.statusCode).toBe(200);
    expect(firstSummary.json().data.records.length).toBeGreaterThan(0);
    expect(firstSummary.json().data.records.every((record: { workspaceId: string }) => record.workspaceId === first.workspace.id)).toBe(true);
    expect(secondSummary.statusCode).toBe(200);
    expect(secondSummary.json().data.records).toEqual([]);

    await app.close();
  });

  it("generates an Analytics Consultant digest from the requested metrics window", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const content = await createPublishedContent(session.workspace.id);

    await seedVault(app, headers);
    await prisma.instagramAnalytics.create({
      data: {
        contentItemId: content.id,
        dataDate: dayStart(new Date()),
        metricType: "POST",
        metrics: {
          likes: 12,
          reach: 220,
          shares: 4
        },
        syncedAt: new Date(),
        workspaceId: session.workspace.id
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/analytics/digest",
      headers,
      payload: {
        days: 7,
        locale: "en"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        days: 7,
        locale: "en",
        run: {
          agent: "ANALYTICS_CONSULTANT",
          output: {
            analyticsDays: 7,
            format: "digest",
            reach: 220
          },
          request: {
            inputs: {
              analyticsDays: 7,
              analyticsSummary: {
                days: 7,
                totals: {
                  reach: 220
                }
              },
              outputFormat: "digest"
            }
          }
        }
      }
    });

    await app.close();
  });

  it("answers analytics chat questions with the Analytics Consultant", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    await seedVault(app, headers);

    const response = await app.inject({
      method: "POST",
      url: "/v1/analytics/chat",
      headers,
      payload: {
        days: 30,
        locale: "en",
        question: "Which post should we repeat?"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        days: 30,
        locale: "en",
        question: "Which post should we repeat?",
        run: {
          agent: "ANALYTICS_CONSULTANT",
          output: {
            analyticsDays: 30,
            format: "chat_answer",
            question: "Which post should we repeat?"
          },
          request: {
            inputs: {
              analyticsDays: 30,
              outputFormat: "chat_answer",
              question: "Which post should we repeat?"
            }
          }
        }
      }
    });

    await app.close();
  });

  it("writes workspace-scoped analytics performance learning into the Vault", async () => {
    const app = await buildApp();
    const owner = await registerTestUser(app);
    const other = await registerTestUser(app);
    const headers = authHeaders(owner.tokens.accessToken);
    const ownerContent = await createPublishedContent(owner.workspace.id, {
      captionEn: "Owner winning format",
      publishedAt: new Date()
    });
    const otherContent = await createPublishedContent(other.workspace.id, {
      captionEn: "Other workspace format",
      publishedAt: new Date()
    });

    await prisma.instagramAnalytics.createMany({
      data: [
        {
          contentItemId: ownerContent.id,
          dataDate: dayStart(new Date()),
          metricType: "POST",
          metrics: {
            likes: 33,
            reach: 333,
            shares: 9
          },
          syncedAt: new Date(),
          workspaceId: owner.workspace.id
        },
        {
          contentItemId: otherContent.id,
          dataDate: dayStart(new Date()),
          metricType: "POST",
          metrics: {
            likes: 88,
            reach: 888,
            shares: 8
          },
          syncedAt: new Date(),
          workspaceId: other.workspace.id
        }
      ]
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/analytics/learning",
      headers,
      payload: {
        days: 7
      }
    });
    const ownerLearning = await prisma.knowledgeVault.findFirstOrThrow({
      where: {
        key: response.json().data.key,
        section: "OBJECTIVES",
        workspaceId: owner.workspace.id
      }
    });
    const leakedLearning = await prisma.knowledgeVault.findFirst({
      where: {
        key: response.json().data.key,
        section: "OBJECTIVES",
        workspaceId: other.workspace.id
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        entry: {
          key: expect.stringContaining("analytics.performance."),
          section: "OBJECTIVES",
          workspaceId: owner.workspace.id
        },
        observations: expect.arrayContaining([expect.stringContaining("reach 333")]),
        recordCount: 1,
        topContentCount: 1,
        workspaceId: owner.workspace.id
      }
    });
    expect(ownerLearning.value).toMatchObject({
      kind: "ANALYTICS_PERFORMANCE_LEARNING",
      totals: {
        reach: 333
      },
      topContent: [
        expect.objectContaining({
          caption: "Owner winning format",
          contentItemId: ownerContent.id
        })
      ]
    });
    expect(JSON.stringify(ownerLearning.value)).not.toContain("888");
    expect(JSON.stringify(ownerLearning.value)).not.toContain("Other workspace format");
    expect(leakedLearning).toBeNull();

    await app.close();
  });

  it("exports a workspace-scoped monthly analytics PDF", async () => {
    const app = await buildApp();
    const owner = await registerTestUser(app);
    const other = await registerTestUser(app);
    const headers = authHeaders(owner.tokens.accessToken);
    const januaryContent = await createPublishedContent(owner.workspace.id, {
      captionEn: "January proof post",
      publishedAt: new Date(Date.UTC(2026, 0, 10))
    });
    const februaryContent = await createPublishedContent(owner.workspace.id, {
      captionEn: "February proof post",
      publishedAt: new Date(Date.UTC(2026, 1, 10))
    });
    const otherContent = await createPublishedContent(other.workspace.id, {
      captionEn: "Other workspace post",
      publishedAt: new Date(Date.UTC(2026, 0, 10))
    });

    await prisma.instagramAnalytics.createMany({
      data: [
        {
          contentItemId: januaryContent.id,
          dataDate: new Date(Date.UTC(2026, 0, 10)),
          metricType: "POST",
          metrics: {
            likes: 10,
            reach: 220,
            shares: 2
          },
          syncedAt: new Date(Date.UTC(2026, 0, 11)),
          workspaceId: owner.workspace.id
        },
        {
          contentItemId: februaryContent.id,
          dataDate: new Date(Date.UTC(2026, 1, 10)),
          metricType: "POST",
          metrics: {
            likes: 99,
            reach: 999,
            shares: 9
          },
          syncedAt: new Date(Date.UTC(2026, 1, 11)),
          workspaceId: owner.workspace.id
        },
        {
          contentItemId: otherContent.id,
          dataDate: new Date(Date.UTC(2026, 0, 10)),
          metricType: "POST",
          metrics: {
            likes: 77,
            reach: 777,
            shares: 7
          },
          syncedAt: new Date(Date.UTC(2026, 0, 11)),
          workspaceId: other.workspace.id
        }
      ]
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/analytics/monthly-pdf?month=2026-01&locale=en",
      headers
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("markos-analytics-analytics-workspace");
    expect(response.headers["content-disposition"]).toContain("2026-01.pdf");
    expect(response.body.startsWith("%PDF-1.4")).toBe(true);
    expect(response.body).toContain("MARKOS AI Monthly Analytics Report");
    expect(response.body).toContain("Month: 2026-01");
    expect(response.body).toContain("Reach: 220");
    expect(response.body).toContain("January proof post");
    expect(response.body).not.toContain("February proof post");
    expect(response.body).not.toContain("Other workspace post");
    expect(response.body.trimEnd().endsWith("%%EOF")).toBe(true);

    await app.close();
  });

  it("sends a monthly analytics PDF email and records delivery evidence", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    const response = await app.inject({
      method: "POST",
      url: "/v1/analytics/monthly-email",
      headers,
      payload: {
        locale: "en",
        month: "2026-01"
      }
    });
    const notification = await prisma.notification.findFirstOrThrow({
      where: {
        channel: "EMAIL",
        templateKey: "MONTHLY_ANALYTICS_PDF",
        workspaceId: session.workspace.id
      }
    });
    const auditLog = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "MONTHLY_ANALYTICS_PDF_EMAIL_SENT",
        workspaceId: session.workspace.id
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        delivered: true,
        filename: expect.stringContaining("2026-01.pdf"),
        mode: "dry_run",
        month: "2026-01",
        recipients: [session.user.email],
        workspaceId: session.workspace.id
      }
    });
    expect(notification.payload).toMatchObject({
      month: "2026-01",
      recipients: [session.user.email]
    });
    expect(auditLog.metadata).toMatchObject({
      month: "2026-01",
      recipients: [session.user.email]
    });

    await app.close();
  });

  it("maintenance worker analytics sync scans connected workspaces", async () => {
    const workspace = await createWorkspace("analytics-worker");
    await persistTestInstagramConnection({ workspaceId: workspace.id, actorId: workspace.ownerUserId, accessToken: "analytics-worker-token" });
    const content = await createPublishedContent(workspace.id);
    const provider: InstagramAnalyticsProvider = {
      mode: "dry_run",
      async syncWorkspace() {
        return [
          {
            contentItemId: content.id,
            dataDate: new Date(Date.UTC(2026, 0, 1)),
            metricType: "POST",
            metrics: {
              likes: 44,
              reach: 250
            }
          }
        ];
      }
    };

    const result = await syncInstagramAnalyticsForAllWorkspaces({
      now: new Date(Date.UTC(2026, 0, 2)),
      provider,
      workspaceIds: [workspace.id]
    });
    const rows = await prisma.instagramAnalytics.findMany({
      where: {
        workspaceId: workspace.id
      }
    });

    expect(result.attempted).toBeGreaterThanOrEqual(1);
    expect(rows).toEqual([
      expect.objectContaining({
        contentItemId: content.id,
        metricType: "POST",
        metrics: {
          likes: 44,
          reach: 250
        }
      })
    ]);
  });

  it("maps live Meta Graph account and media insight responses into analytics snapshots", async () => {
    const workspace = await createWorkspace("analytics-live-provider");
    const content = await createPublishedContent(workspace.id, {
      publishedAt: new Date(Date.UTC(2026, 0, 5))
    });
    const urls: string[] = [];
    const provider = new MetaGraphInstagramAnalyticsProvider({
      fetchImpl: async (input) => {
        const url = input.toString();
        urls.push(url);

        if (url.includes("/17841400000000000?")) {
          return jsonResponse({
            followers_count: 3210,
            media_count: 42
          });
        }

        if (url.includes(`/${content.instagramPostId}/insights?`)) {
          return jsonResponse({
            data: [
              { name: "likes", values: [{ value: 21 }] },
              { name: "comments", values: [{ value: 3 }] },
              { name: "reach", values: [{ value: 240 }] },
              { name: "saved", values: [{ value: 5 }] },
              { name: "shares", values: [{ value: 7 }] },
              { name: "views", values: [{ value: 400 }] }
            ]
          });
        }

        return jsonResponse({ error: { message: "Unexpected URL" } }, 404);
      },
      graphBaseUrl: "https://graph.facebook.test",
      graphVersion: "v25.0"
    });

    const snapshots = await provider.syncWorkspace({
      contentItems: [content],
      from: new Date(Date.UTC(2026, 0, 1)),
      to: new Date(Date.UTC(2026, 0, 31)),
      workspace: {
        ...workspace,
        instagramAccessToken: "live-token",
        instagramAccountId: "17841400000000000",
        instagramTokenExpiresAt: new Date(Date.UTC(2026, 1, 1))
      }
    });

    expect(snapshots).toEqual([
      {
        dataDate: new Date(Date.UTC(2026, 0, 31)),
        metricType: "ACCOUNT",
        metrics: {
          followers: 3210,
          mediaCount: 42
        }
      },
      {
        contentItemId: content.id,
        dataDate: new Date(Date.UTC(2026, 0, 5)),
        metricType: "POST",
        metrics: {
          comments: 3,
          likes: 21,
          reach: 240,
          saves: 5,
          shares: 7,
          views: 400
        }
      }
    ]);
    expect(urls[0]).toContain("fields=followers_count%2Cmedia_count");
    expect(urls[1]).toContain("metric=comments%2Cimpressions%2Clikes%2Creach%2Csaved%2Cshares%2Cviews");
    expect(urls.every((url) => url.includes("access_token=live-token"))).toBe(true);
  });
});

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = `analytics-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password: "CorrectHorseBattery99!",
      fullName: "Analytics User",
      workspaceName: `Analytics Workspace ${randomUUID()}`,
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

async function seedVault(app: Awaited<ReturnType<typeof buildApp>>, headers: Record<string, string>): Promise<void> {
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
}

async function createPublishedContent(workspaceId: string, input: { captionEn?: string; publishedAt?: Date } = {}) {
  return prisma.contentItem.create({
    data: {
      captionEn: input.captionEn ?? "Analytics post",
      contentType: "POST",
      hashtags: ["#MarkosAI"],
      instagramPostId: `ig-${randomUUID()}`,
      mediaIds: [],
      publishedAt: input.publishedAt ?? new Date(),
      status: "PUBLISHED",
      workspaceId
    }
  });
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

function dayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function createWorkspace(label: string) {
  const suffix = randomUUID();
  const plan = await prisma.plan.upsert({
    create: {
      code: "TEST_ANALYTICS",
      currency: "BHD",
      limits: {
        aiGenerations: 100,
        aiImages: 20,
        aiInputTokens: 1_000_000,
        aiOutputTokens: 500_000,
        posts: 30,
        storageBytes: 1_000_000_000,
        strategies: 1,
        workspaces: 1
      },
      name: "Test Analytics",
      priceMinor: 0
    },
    update: {
      active: true
    },
    where: {
      code: "TEST_ANALYTICS"
    }
  });
  const user = await prisma.user.create({
    data: {
      email: `${label}-${suffix}@markos.test`,
      fullName: "Analytics Worker",
      locale: "EN",
      planId: plan.id
    }
  });

  return prisma.workspace.create({
    data: {
      name: `Analytics ${label}`,
      ownerUserId: user.id,
      slug: `${label}-${suffix}`
    }
  });
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status
  });
}
