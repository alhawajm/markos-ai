import type { ContentItem, MediaAsset, Workspace } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import type { InstagramPublisher } from "../src/publishing/instagram-publisher";
import { runMaintenanceWorkerTick } from "../src/worker/maintenance-worker";

describe("maintenance worker", () => {
  it("publishes due content across workspaces", async () => {
    await prisma.contentItem.updateMany({
      data: {
        status: "FAILED"
      },
      where: {
        captionEn: "Worker publish",
        status: "SCHEDULED"
      }
    });
    const first = await createPublishableWorkspace("worker-publish-a");
    const second = await createPublishableWorkspace("worker-publish-b");
    const publishedContentIds: string[] = [];
    const publisher: InstagramPublisher = {
      async publish(input: { contentItem: ContentItem; mediaAssets: MediaAsset[]; workspace: Workspace }) {
        publishedContentIds.push(input.contentItem.id);

        return {
          dryRun: false,
          instagramPostId: `ig-${input.contentItem.id}`,
          payload: {
            accountId: input.workspace.instagramAccountId ?? "",
            caption: input.contentItem.captionEn ?? "",
            contentItemId: input.contentItem.id,
            contentType: input.contentItem.contentType,
            mediaUrls: input.mediaAssets.map((asset) => asset.cdnUrl)
          },
          status: "PUBLISHED"
        };
      }
    };

    const result = await runMaintenanceWorkerTick({
      publisher,
      runTokenRefresh: false,
      runUsageReset: false
    });
    const [firstAfter, secondAfter] = await Promise.all([
      prisma.contentItem.findUniqueOrThrow({
        where: {
          id: first.content.id
        }
      }),
      prisma.contentItem.findUniqueOrThrow({
        where: {
          id: second.content.id
        }
      })
    ]);

    expect(result.publishing?.attempted).toBeGreaterThanOrEqual(2);
    expect(publishedContentIds).toEqual(expect.arrayContaining([first.content.id, second.content.id]));
    expect(firstAfter.status).toBe("PUBLISHED");
    expect(secondAfter.status).toBe("PUBLISHED");
  });

  it("refreshes due Instagram tokens", async () => {
    const workspace = await createWorkspace("worker-refresh");
    const oldToken = `old-token-${randomUUID()}`;
    await prisma.workspace.update({
      data: {
        instagramAccessToken: oldToken,
        instagramAccountId: `refresh-account-${randomUUID()}`,
        instagramTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      },
      where: {
        id: workspace.id
      }
    });
    const fetchImpl: typeof fetch = async (_input, _init): Promise<Response> =>
      new Response(
        JSON.stringify({
          access_token: `new-token-${randomUUID()}`,
          expires_in: 60 * 24 * 60 * 60
        }),
        {
          headers: {
            "content-type": "application/json"
          },
          status: 200
        }
      );

    const result = await runMaintenanceWorkerTick({
      fetchImpl,
      runPublishing: false,
      runUsageReset: false
    });
    const updated = await prisma.workspace.findUniqueOrThrow({
      where: {
        id: workspace.id
      }
    });

    expect(result.tokenRefresh).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          refreshed: true,
          workspaceId: workspace.id
        })
      ])
    );
    expect(updated.instagramAccessToken).not.toBe(oldToken);
  });

  it("rolls monthly usage counters forward without resetting lifetime storage", async () => {
    const workspace = await createWorkspace("worker-usage-reset");
    const now = new Date(Date.UTC(2026, 1, 5, 12));
    const previousPeriodStart = new Date(Date.UTC(2026, 0, 1));
    const previousPeriodEnd = new Date(Date.UTC(2026, 1, 1));
    const currentPeriodStart = new Date(Date.UTC(2026, 1, 1));

    await prisma.usageCounter.create({
      data: {
        workspaceId: workspace.id,
        metric: "AI_GENERATION",
        periodStart: previousPeriodStart,
        periodEnd: previousPeriodEnd,
        limit: 100,
        used: 7
      }
    });
    await prisma.usageCounter.create({
      data: {
        workspaceId: workspace.id,
        metric: "STORAGE_BYTES",
        periodStart: new Date(Date.UTC(1970, 0, 1)),
        periodEnd: new Date(Date.UTC(9999, 11, 31)),
        limit: 1_000_000_000,
        used: 500_000
      }
    });

    const result = await runMaintenanceWorkerTick({
      now,
      runPublishing: false,
      runTokenRefresh: false
    });
    const currentCounters = await prisma.usageCounter.findMany({
      orderBy: {
        metric: "asc"
      },
      where: {
        periodStart: currentPeriodStart,
        workspaceId: workspace.id
      }
    });
    const previousCounter = await prisma.usageCounter.findUniqueOrThrow({
      where: {
        workspaceId_metric_periodStart: {
          workspaceId: workspace.id,
          metric: "AI_GENERATION",
          periodStart: previousPeriodStart
        }
      }
    });
    const currentStorageCounter = await prisma.usageCounter.findUnique({
      where: {
        workspaceId_metric_periodStart: {
          workspaceId: workspace.id,
          metric: "STORAGE_BYTES",
          periodStart: currentPeriodStart
        }
      }
    });

    expect(result.usageReset?.periodStart).toBe(currentPeriodStart.toISOString());
    expect(currentCounters.map((counter) => counter.metric).sort()).toEqual([
      "AI_GENERATION",
      "AI_IMAGE",
      "POST_PUBLISH",
      "STRATEGY"
    ]);
    expect(currentCounters.every((counter) => counter.used === 0)).toBe(true);
    expect(previousCounter.used).toBe(7);
    expect(currentStorageCounter).toBeNull();
  });
});

async function createPublishableWorkspace(label: string) {
  const workspace = await createWorkspace(label);
  await prisma.workspace.update({
    data: {
      instagramAccessToken: `publish-token-${randomUUID()}`,
      instagramAccountId: `publish-account-${randomUUID()}`,
      instagramTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    },
    where: {
      id: workspace.id
    }
  });
  const media = await prisma.mediaAsset.create({
    data: {
      cdnUrl: `https://cdn.example.com/${randomUUID()}.jpg`,
      filename: "worker.jpg",
      height: 1080,
      mimeType: "image/jpeg",
      s3Key: `external:${randomUUID()}`,
      sizeBytes: 120000,
      type: "IMAGE",
      width: 1080,
      workspaceId: workspace.id
    }
  });
  const content = await prisma.contentItem.create({
    data: {
      captionEn: "Worker publish",
      contentType: "POST",
      hashtags: ["#MarkosAI"],
      mediaIds: [media.id],
      scheduledAt: new Date(Date.now() - 60 * 1000),
      status: "SCHEDULED",
      workspaceId: workspace.id
    }
  });

  return {
    content,
    media,
    workspace
  };
}

async function createWorkspace(label: string) {
  const suffix = randomUUID();
  const plan = await prisma.plan.upsert({
    create: {
      code: "TEST_WORKER",
      currency: "BHD",
      limits: {
        aiGenerations: 100,
        aiImages: 20,
        posts: 30,
        storageBytes: 1_000_000_000,
        strategies: 1,
        workspaces: 1
      },
      name: "Test Worker",
      priceMinor: 0
    },
    update: {
      active: true,
      limits: {
        aiGenerations: 100,
        aiImages: 20,
        posts: 30,
        storageBytes: 1_000_000_000,
        strategies: 1,
        workspaces: 1
      }
    },
    where: {
      code: "TEST_WORKER"
    }
  });
  const user = await prisma.user.create({
    data: {
      email: `${label}-${suffix}@markos.test`,
      fullName: "Worker User",
      locale: "EN",
      planId: plan.id
    }
  });

  return prisma.workspace.create({
    data: {
      name: `Worker ${label}`,
      ownerUserId: user.id,
      slug: `${label}-${suffix}`
    }
  });
}
