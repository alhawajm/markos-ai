import type { ContentItem, MediaAsset, PublishJob, Workspace } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import type { AnalyticsEmailProvider } from "../src/analytics/analytics-email-service";
import { InstagramGraphPublisher, InstagramPublishError, type InstagramPublisher } from "../src/publishing/instagram-publisher";
import { runMaintenanceWorkerTick } from "../src/worker/maintenance-worker";
import { persistTestInstagramConnection } from "./helpers/instagram-connection";
import { decryptCredential } from "../src/security/credential-encryption";
import { env } from "../src/config/env";
import { processDuePublishJobs, queuePublishNow } from "../src/publishing/publish-job-service";
import { ContentScheduleError, rescheduleContentItem, scheduleContentItem, unscheduleContentItem } from "../src/content/content-service";

afterEach(() => {
  vi.useRealTimers();
});

function scheduleTestClock() {
  // Use the same isolated historical window as the existing worker fixtures,
  // including Date.now() for the public API's future-schedule validation.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  return new Date();
}

describe("maintenance worker", () => {
  it.each(["QUEUED", "RETRY_WAIT"] as const)("cancels a %s job atomically with unscheduling", async (status) => {
    const now = scheduleTestClock();
    const target = await createPublishableWorkspace(`worker-cancel-${status}`, now);
    const job = await queuePublishNow(target.workspace.id, target.content.id, now);
    await prisma.publishJob.update({ where: { id: job.id }, data: { status } });
    await unscheduleContentItem(target.workspace.id, target.content.id);
    await expect(prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } })).resolves.toMatchObject({ status: "CANCELLED" });
    const publisher = successfulPublisher();
    await processDuePublishJobs({ now, publisher });
    expect(publisher.publish).not.toHaveBeenCalled();
    await expect(prisma.contentItem.findUniqueOrThrow({ where: { id: target.content.id } })).resolves.toMatchObject({
      status: "APPROVED",
      scheduledAt: null,
      failureReason: null
    });
  });

  it.each(["QUEUED", "RETRY_WAIT"] as const)("replaces a %s schedule without publishing at its old time", async (status) => {
    const now = scheduleTestClock();
    const later = new Date(Math.ceil((now.getTime() + 3_600_000) / 1_800_000) * 1_800_000);
    const target = await createPublishableWorkspace(`worker-reschedule-${status}`, now);
    const job = await queuePublishNow(target.workspace.id, target.content.id, now);
    await prisma.publishJob.update({ where: { id: job.id }, data: { status } });
    await rescheduleContentItem(target.workspace.id, target.content.id, { scheduledAt: later.toISOString() });
    const publisher = successfulPublisher();
    await processDuePublishJobs({ now, publisher });
    expect(publisher.publish).not.toHaveBeenCalled();
    await expect(prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } })).resolves.toMatchObject({ status: "CANCELLED" });
    await processDuePublishJobs({ now: later, publisher });
    expect(publisher.publish).toHaveBeenCalledOnce();
    expect(publisher.publish.mock.calls[0]![0].contentItem.id).toBe(target.content.id);
  });

  it("rejects schedule edits while the claimed publish is inside the provider", async () => {
    const now = scheduleTestClock();
    const later = new Date(Math.ceil((now.getTime() + 3_600_000) / 1_800_000) * 1_800_000);
    const target = await createPublishableWorkspace("worker-edit-claimed", now);
    const job = await queuePublishNow(target.workspace.id, target.content.id, now);
    const publisher = successfulPublisher();
    let checked = false;
    const original = publisher.publish.getMockImplementation()!;
    publisher.publish.mockImplementation(async (input) => {
      await expect(unscheduleContentItem(target.workspace.id, target.content.id)).rejects.toThrow("Publishing has started");
      await expect(rescheduleContentItem(target.workspace.id, target.content.id, { scheduledAt: later.toISOString() })).rejects.toThrow(ContentScheduleError);
      await expect(prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } })).resolves.toMatchObject({ status: "PROCESSING" });
      checked = true;
      return original(input);
    });
    await processDuePublishJobs({ now, publisher });
    expect(checked).toBe(true);
    await expect(prisma.contentItem.findUniqueOrThrow({ where: { id: target.content.id } })).resolves.toMatchObject({ status: "PUBLISHED" });
  });

  it("honors cancellation after candidate discovery but before the worker claims it", async () => {
    const now = scheduleTestClock();
    const target = await createPublishableWorkspace("worker-cancel-race", now);
    const job = await queuePublishNow(target.workspace.id, target.content.id, now);
    const find = prisma.publishJob.findFirst.bind(prisma.publishJob);
    let discovered!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      discovered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store: { findFirst: (args?: Parameters<typeof prisma.publishJob.findFirst>[0]) => Promise<PublishJob | null> } = prisma.publishJob;
    const spy = vi.spyOn(store, "findFirst").mockImplementationOnce(async (args) => {
      const candidate = await find(args);
      discovered();
      await held;
      return candidate;
    });
    const publisher = successfulPublisher();
    const running = processDuePublishJobs({ now, publisher });
    try {
      await ready;
      await unscheduleContentItem(target.workspace.id, target.content.id);
    } finally {
      release();
      await running;
      spy.mockRestore();
    }
    expect(publisher.publish).not.toHaveBeenCalled();
    await expect(prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } })).resolves.toMatchObject({ status: "CANCELLED", attempts: 0 });
  });

  it("allows a cancelled time to be scheduled again without reusing its cancelled job", async () => {
    const now = scheduleTestClock();
    const later = new Date(Math.ceil((now.getTime() + 3_600_000) / 1_800_000) * 1_800_000);
    const target = await createPublishableWorkspace("worker-same-time", now);
    await prisma.contentItem.update({ where: { id: target.content.id }, data: { status: "APPROVED", scheduledAt: null } });
    await scheduleContentItem(target.workspace.id, target.content.id, { scheduledAt: later.toISOString() });
    await processDuePublishJobs({ now: later, shouldStop: () => true });
    const old = await prisma.publishJob.findFirstOrThrow({ where: { contentItemId: target.content.id } });
    await unscheduleContentItem(target.workspace.id, target.content.id);
    await scheduleContentItem(target.workspace.id, target.content.id, { scheduledAt: later.toISOString() });
    const publisher = successfulPublisher();
    await processDuePublishJobs({ now: later, publisher });
    expect(publisher.publish).toHaveBeenCalledOnce();
    await expect(prisma.publishJob.findUniqueOrThrow({ where: { id: old.id } })).resolves.toMatchObject({ status: "CANCELLED" });
    expect(await prisma.publishJob.count({ where: { contentItemId: target.content.id, status: "PUBLISHED" } })).toBe(1);
  });

  it("claims simultaneous publishes from three workspaces once even when workers compete", async () => {
    const now = new Date("2026-01-04T12:00:00Z");
    const targets = await Promise.all(["a", "b", "c"].map((suffix) => createPublishableWorkspace(`worker-three-${suffix}`, now)));
    await Promise.all(targets.map(({ workspace, content }) => queuePublishNow(workspace.id, content.id, now)));
    const published: string[] = [];
    const publisher: InstagramPublisher = {
      async publish(input) {
        const target = targets.find(({ content }) => content.id === input.contentItem.id);
        expect(target).toBeDefined();
        expect(input.workspace.id).toBe(target!.workspace.id);
        expect(input.mediaAssets.map((asset) => asset.id)).toEqual([target!.media.id]);
        published.push(input.contentItem.id);
        await input.beforeRequest?.();
        return {
          dryRun: false,
          instagramPostId: `ig-${input.contentItem.id}`,
          payload: {
            accountId: input.workspace.instagramAccountId ?? "",
            caption: input.contentItem.caption ?? "",
            contentItemId: input.contentItem.id,
            contentType: input.contentItem.contentType,
            mediaCount: input.mediaAssets.length
          },
          status: "PUBLISHED"
        };
      }
    };
    await Promise.all([1, 2, 3].map(() => processDuePublishJobs({ now, publisher })));
    // A losing compare-and-swap can end a tick; the next tick must finish the queue.
    await processDuePublishJobs({ now, publisher });
    expect(published.sort()).toEqual(targets.map(({ content }) => content.id).sort());
    for (const { workspace, content } of targets) {
      await expect(prisma.contentItem.findUniqueOrThrow({ where: { id: content.id } })).resolves.toMatchObject({
        workspaceId: workspace.id,
        status: "PUBLISHED",
        instagramPostId: `ig-${content.id}`
      });
      const job = await prisma.publishJob.findFirstOrThrow({ where: { contentItemId: content.id } });
      expect(job).toMatchObject({ workspaceId: workspace.id, status: "PUBLISHED", attempts: 1 });
      expect(await prisma.publishAttempt.count({ where: { publishJobId: job.id } })).toBe(1);
    }
  }, 60_000);

  it("publishes a queued Reel only after processing finishes and persists its final media ID", async () => {
    const now = new Date("2026-01-03T12:00:00Z");
    const target = await createPublishableWorkspace("worker-publish-now-reel", now);
    const video = await prisma.mediaAsset.create({
      data: { ...target.media, id: randomUUID(), filename: "reel.mp4", mimeType: "video/mp4", width: 720, height: 1280, durationSeconds: 8 }
    });
    await prisma.$transaction(async (tx) => {
      await tx.contentItem.update({ where: { id: target.content.id }, data: { contentType: "REEL", status: "APPROVED", scheduledAt: null } });
      await tx.contentMediaItem.updateMany({ where: { contentItemId: target.content.id }, data: { mediaKind: "VIDEO", mediaAssetId: video.id } });
    });
    const job = await queuePublishNow(target.workspace.id, target.content.id, now);
    const steps: string[] = [];
    let polls = 0;
    const publisher = new InstagramGraphPublisher({
      pollDelayMs: 0,
      providerUrlResolver: async () => "https://cdn.example.com/reel.mp4",
      fetchImpl: async (url, init) => {
        const path = new URL(url).pathname;
        if (path.endsWith("/content_publishing_limit"))
          return Response.json({ data: [{ quota_usage: 0, config: { quota_total: 100, quota_duration: 86400 } }] });
        if (path.endsWith("/media")) {
          const body = new URLSearchParams(String(init?.body));
          expect(body.get("media_type")).toBe("REELS");
          expect(body.get("video_url")).toBe("https://cdn.example.com/reel.mp4");
          steps.push("container");
          return Response.json({ id: "reel-container" });
        }
        if (path.endsWith("/reel-container")) {
          polls++;
          steps.push(polls === 1 ? "processing" : "finished");
          return Response.json({ status_code: polls === 1 ? "IN_PROGRESS" : "FINISHED" });
        }
        if (path.endsWith("/media_publish")) {
          expect(new URLSearchParams(String(init?.body)).get("creation_id")).toBe("reel-container");
          expect(steps.at(-1)).toBe("finished");
          steps.push("publish");
          return Response.json({ id: "reel-published-id" });
        }
        throw new Error("Unexpected test transport request");
      }
    });
    await processDuePublishJobs({ now, publisher });
    await processDuePublishJobs({ now, publisher });
    expect(steps).toEqual(["container", "processing", "finished", "publish"]);
    expect(await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "PUBLISHED", attempts: 1 });
    expect(await prisma.contentItem.findUniqueOrThrow({ where: { id: target.content.id } })).toMatchObject({
      status: "PUBLISHED",
      instagramPostId: "reel-published-id"
    });
    expect(await prisma.publishAttempt.findMany({ where: { publishJobId: job.id } })).toMatchObject([{ status: "PUBLISHED" }]);
  });

  it("renews a long publish lease and prevents a second worker and repeated ticks from publishing it", async () => {
    const now = new Date("2026-01-05T12:00:00Z");
    const target = await createPublishableWorkspace("worker-long-publish", now);
    const job = await queuePublishNow(target.workspace.id, target.content.id, now);
    let calls = 0;
    const publisher: InstagramPublisher = {
      async publish(input) {
        if (input.contentItem.id === target.content.id) {
          calls += 1;
          // Renew a nearly expired lease at the provider boundary, then simulate
          // another worker checking after the original lease would have expired.
          await prisma.publishJob.update({ where: { id: job.id }, data: { leaseExpiresAt: new Date(now.getTime() + 60_000) } });
          await input.beforeRequest?.();
          const current = await prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } });
          expect(current.leaseExpiresAt!.getTime()).toBeGreaterThanOrEqual(now.getTime() + 5 * 60_000);
          const second = await processDuePublishJobs({ now: new Date(now.getTime() + 2 * 60_000), publisher });
          expect(second.processed).toBe(0);
        }
        return {
          dryRun: false,
          status: "PUBLISHED",
          instagramPostId: `ig-${input.contentItem.id}`,
          payload: {
            accountId: input.workspace.instagramAccountId!,
            contentItemId: input.contentItem.id,
            caption: input.contentItem.caption,
            contentType: input.contentItem.contentType,
            mediaCount: input.mediaAssets.length
          }
        };
      }
    };
    await processDuePublishJobs({ now, publisher });
    await processDuePublishJobs({ now: new Date(now.getTime() + 6 * 60_000), publisher });
    expect(calls).toBe(1);
    await expect(prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } })).resolves.toMatchObject({ status: "PUBLISHED", attempts: 1 });
  });

  it("does not republish an expired in-flight attempt with an unknown external result", async () => {
    const now = new Date("2026-01-06T12:00:00Z");
    const target = await createPublishableWorkspace("worker-interrupted", now);
    const job = await queuePublishNow(target.workspace.id, target.content.id, now);
    await prisma.publishJob.update({ where: { id: job.id }, data: { status: "PROCESSING", attempts: 1, leaseExpiresAt: new Date(now.getTime() - 1) } });
    await expect(unscheduleContentItem(target.workspace.id, target.content.id)).rejects.toThrow("Publishing has started");
    const publish = vi.fn();
    await processDuePublishJobs({ now, publisher: { publish } });
    expect(publish).not.toHaveBeenCalled();
    await expect(prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } })).resolves.toMatchObject({
      status: "FAILED",
      lastErrorCode: "INSTAGRAM_PUBLISH_RESULT_UNKNOWN"
    });
  });

  it("keeps retry backoff and succeeds once after a known pre-publication failure", async () => {
    const now = new Date("2026-01-07T12:00:00Z");
    const target = await createPublishableWorkspace("worker-retry", now);
    const job = await queuePublishNow(target.workspace.id, target.content.id, now);
    let calls = 0;
    const publisher: InstagramPublisher = {
      async publish(input) {
        calls += 1;
        if (calls === 1) throw new InstagramPublishError("INSTAGRAM_PROVIDER_NETWORK_ERROR", true);
        return {
          dryRun: false,
          status: "PUBLISHED",
          instagramPostId: "ig-retried",
          payload: {
            accountId: input.workspace.instagramAccountId!,
            contentItemId: input.contentItem.id,
            caption: input.contentItem.caption,
            contentType: input.contentItem.contentType,
            mediaCount: 1
          }
        };
      }
    };
    await processDuePublishJobs({ now, publisher });
    await expect(prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } })).resolves.toMatchObject({ status: "RETRY_WAIT", attempts: 1 });
    await processDuePublishJobs({ now: new Date(now.getTime() + 60_000), publisher });
    expect(calls).toBe(1);
    await processDuePublishJobs({ now: new Date(now.getTime() + 3 * 60_000), publisher });
    await processDuePublishJobs({ now: new Date(now.getTime() + 4 * 60_000), publisher });
    expect(calls).toBe(2);
    await expect(prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } })).resolves.toMatchObject({ status: "PUBLISHED", attempts: 2 });
  });

  it("recovers an already-saved publication after worker interruption without publishing again", async () => {
    const now = new Date("2026-01-08T12:00:00Z");
    const target = await createPublishableWorkspace("worker-saved-publication", now);
    const job = await queuePublishNow(target.workspace.id, target.content.id, now);
    await prisma.publishJob.update({ where: { id: job.id }, data: { status: "PROCESSING", attempts: 1, leaseExpiresAt: new Date(now.getTime() - 1) } });
    await prisma.contentItem.update({ where: { id: target.content.id }, data: { status: "PUBLISHED", instagramPostId: "ig-already-saved", publishedAt: now } });
    const publish = vi.fn();
    await processDuePublishJobs({ now, publisher: { publish } });
    expect(publish).not.toHaveBeenCalled();
    await expect(prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } })).resolves.toMatchObject({ status: "PUBLISHED", lastErrorCode: null });
    await expect(prisma.contentItem.findUniqueOrThrow({ where: { id: target.content.id } })).resolves.toMatchObject({
      status: "PUBLISHED",
      instagramPostId: "ig-already-saved"
    });
  });

  it("stops external work when its publishing lease is no longer valid", async () => {
    const now = new Date("2026-01-09T12:00:00Z");
    const target = await createPublishableWorkspace("worker-lost-lease", now);
    const job = await queuePublishNow(target.workspace.id, target.content.id, now);
    let published = false;
    const publisher: InstagramPublisher = {
      async publish(input) {
        await prisma.publishJob.update({ where: { id: job.id }, data: { leaseExpiresAt: new Date(now.getTime() - 1) } });
        await input.beforeRequest?.();
        published = true;
        throw new Error("Must not reach the provider after losing the lease");
      }
    };
    await processDuePublishJobs({ now, publisher });
    expect(published).toBe(false);
    await expect(prisma.publishJob.findUniqueOrThrow({ where: { id: job.id } })).resolves.toMatchObject({
      status: "FAILED",
      lastErrorCode: "INSTAGRAM_PUBLISH_LEASE_LOST"
    });
  });

  it("expires temporary offering document analyses", async () => {
    const workspace = await createWorkspace("worker-document-cleanup");
    const analysis = await prisma.offeringDocumentAnalysis.create({
      data: {
        workspaceId: workspace.id,
        status: "FAILED",
        expiresAt: new Date("2026-01-01T00:00:00.000Z")
      }
    });

    const result = await runMaintenanceWorkerTick({
      now: new Date("2026-01-02T00:00:00.000Z"),
      runAnalyticsEmail: false,
      runAnalyticsSync: false,
      runPublishing: false,
      runTokenRefresh: false,
      runUsageReset: false
    });

    expect(result.documentCleanup).toEqual({ expired: 1, failed: 0 });
    await expect(prisma.offeringDocumentAnalysis.findUniqueOrThrow({ where: { id: analysis.id } })).resolves.toMatchObject({
      status: "EXPIRED"
    });
  });

  it("publishes due content across workspaces", async () => {
    const now = new Date(Date.UTC(2026, 0, 1, 12));
    await prisma.contentItem.updateMany({
      data: {
        status: "FAILED"
      },
      where: {
        caption: "Worker publish\n\n#MarkosAI",
        status: "SCHEDULED"
      }
    });
    const first = await createPublishableWorkspace("worker-publish-a", now);
    const second = await createPublishableWorkspace("worker-publish-b", now);
    const publishedContentIds: string[] = [];
    const publisher: InstagramPublisher = {
      async publish(input: { contentItem: ContentItem; mediaAssets: MediaAsset[]; workspace: Workspace }) {
        publishedContentIds.push(input.contentItem.id);

        return {
          dryRun: false,
          instagramPostId: `ig-${input.contentItem.id}`,
          payload: {
            accountId: input.workspace.instagramAccountId ?? "",
            caption: input.contentItem.caption ?? "",
            contentItemId: input.contentItem.id,
            contentType: input.contentItem.contentType,
            mediaCount: input.mediaAssets.length
          },
          status: "PUBLISHED"
        };
      }
    };

    const result = await runMaintenanceWorkerTick({
      now,
      publisher,
      runAnalyticsEmail: false,
      runAnalyticsSync: false,
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
    await expect(
      prisma.publishJob.findFirstOrThrow({
        where: { contentItemId: first.content.id }
      })
    ).resolves.toMatchObject({ status: "PUBLISHED", attempts: 1 });
  }, 60_000);

  it("persists terminal publishing failures and notifies the workspace owner", async () => {
    const now = new Date(Date.UTC(2026, 0, 2, 12));
    const target = await createPublishableWorkspace("worker-publish-failure", now);
    const publisher: InstagramPublisher = {
      async publish() {
        throw new InstagramPublishError("INSTAGRAM_CONTAINER_PROCESSING_FAILED");
      }
    };

    const result = await runMaintenanceWorkerTick({
      now,
      publisher,
      runAnalyticsEmail: false,
      runAnalyticsSync: false,
      runTokenRefresh: false,
      runUsageReset: false
    });
    const [contentAfter, job, notification] = await Promise.all([
      prisma.contentItem.findUniqueOrThrow({ where: { id: target.content.id } }),
      prisma.publishJob.findFirstOrThrow({ where: { contentItemId: target.content.id } }),
      prisma.notification.findFirstOrThrow({
        where: {
          userId: target.workspace.ownerUserId,
          workspaceId: target.workspace.id,
          templateKey: "publishing_failed"
        }
      })
    ]);

    expect(result.publishing?.failed).toBeGreaterThanOrEqual(1);
    expect(contentAfter).toMatchObject({
      failureReason: "INSTAGRAM_CONTAINER_PROCESSING_FAILED",
      status: "FAILED"
    });
    expect(job).toMatchObject({
      attempts: 1,
      lastErrorCode: "INSTAGRAM_CONTAINER_PROCESSING_FAILED",
      status: "FAILED"
    });
    expect(notification.payload).toMatchObject({ contentItemId: target.content.id });
  }, 60_000);

  it("refreshes due Instagram tokens", async () => {
    const workspace = await createWorkspace("worker-refresh");
    const oldToken = `old-token-${randomUUID()}`;
    await persistTestInstagramConnection({
      workspaceId: workspace.id,
      actorId: workspace.ownerUserId,
      accessToken: oldToken,
      expiresAt: new Date(Date.now() + 86_400_000)
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
      runAnalyticsEmail: false,
      runAnalyticsSync: false,
      runPublishing: false,
      runUsageReset: false
    });
    const updated = await prisma.instagramConnectionCredential.findUniqueOrThrow({ where: { workspaceId: workspace.id } });

    expect(result.tokenRefresh).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          refreshed: true,
          workspaceId: workspace.id
        })
      ])
    );
    expect(decryptCredential(updated.encryptedAccessToken, env.INSTAGRAM_TOKEN_ENCRYPTION_KEY!)).not.toBe(oldToken);
  }, 60_000);

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
      runAnalyticsEmail: false,
      runAnalyticsSync: false,
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
      "AI_TOKENS_IN",
      "AI_TOKENS_OUT",
      "CAMPAIGN",
      "POST_PUBLISH"
    ]);
    expect(currentCounters.every((counter) => counter.used === 0n)).toBe(true);
    expect(previousCounter.used).toBe(7n);
    expect(currentStorageCounter).toBeNull();
  }, 60_000);

  it("sends monthly analytics PDF emails once per workspace and month", async () => {
    const now = new Date(Date.UTC(2026, 1, 2, 12));
    const workspace = await createWorkspace("worker-analytics-email");
    const sentFilenames: string[] = [];
    const provider: AnalyticsEmailProvider = {
      mode: "dry_run",
      async send(input) {
        sentFilenames.push(input.filename);

        return {
          messageId: `test:${input.filename}`
        };
      }
    };

    const first = await runMaintenanceWorkerTick({
      analyticsEmailProvider: provider,
      analyticsEmailWorkspaceIds: [workspace.id],
      now,
      runAnalyticsSync: false,
      runPublishing: false,
      runTokenRefresh: false,
      runUsageReset: false
    });
    const second = await runMaintenanceWorkerTick({
      analyticsEmailProvider: provider,
      analyticsEmailWorkspaceIds: [workspace.id],
      now,
      runAnalyticsSync: false,
      runPublishing: false,
      runTokenRefresh: false,
      runUsageReset: false
    });

    expect(first.analyticsEmail?.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          delivered: true,
          month: "2026-01",
          workspaceId: workspace.id
        })
      ])
    );
    expect(second.analyticsEmail?.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          delivered: false,
          month: "2026-01",
          skippedReason: "ALREADY_SENT",
          workspaceId: workspace.id
        })
      ])
    );
    expect(sentFilenames.filter((filename) => filename.includes(workspace.name.toLowerCase().replace(/\s+/g, "-")))).toHaveLength(1);
  }, 60_000);
});

async function createPublishableWorkspace(label: string, now = new Date()) {
  const workspace = await createWorkspace(label);
  await persistTestInstagramConnection({
    workspaceId: workspace.id,
    actorId: workspace.ownerUserId,
    issuedAt: new Date(now.getTime() - 2 * 86_400_000),
    expiresAt: new Date(now.getTime() + 86_400_000)
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
      caption: "Worker publish\n\n#MarkosAI",
      contentType: "POST",
      mediaItems: { create: { position: 0, mediaKind: "IMAGE", mediaAssetId: media.id } },
      scheduledAt: new Date(now.getTime() - 60 * 1000),
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

function successfulPublisher() {
  return {
    publish: vi.fn<InstagramPublisher["publish"]>(async (input) => ({
      dryRun: false,
      status: "PUBLISHED",
      instagramPostId: `ig-${input.contentItem.id}`,
      payload: {
        accountId: input.workspace.instagramAccountId!,
        contentItemId: input.contentItem.id,
        caption: input.contentItem.caption,
        contentType: input.contentItem.contentType,
        mediaCount: input.mediaAssets.length
      }
    }))
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
        aiInputTokens: 1_000_000,
        aiOutputTokens: 500_000,
        posts: 30,
        storageBytes: 1_000_000_000,
        campaigns: 1,
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
        aiInputTokens: 1_000_000,
        aiOutputTokens: 500_000,
        posts: 30,
        storageBytes: 1_000_000_000,
        campaigns: 1,
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
