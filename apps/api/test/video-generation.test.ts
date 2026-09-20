import { createContentAggregate, getContentAggregate, convertContentAggregate } from "../src/content/content-aggregate";
import type { ContentRecord } from "@markos/shared-types";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";

const provider = vi.hoisted(() => ({
  download: vi.fn(),
  status: vi.fn(),
  start: vi.fn()
}));

vi.mock("../src/ai/video-client", () => ({
  downloadGeneratedVideo: provider.download,
  getVideoGenerationStatus: provider.status,
  startVideoGeneration: provider.start
}));

vi.mock("../src/media/storage-service", () => ({
  deleteStoredMedia: vi.fn(),
  storeWorkspaceMedia: vi.fn(async ({ workspaceId, filename }: { workspaceId: string; filename: string }) => ({
    key: `s3:${workspaceId}/${filename}`,
    publicUrl: `https://cdn.example.com/${workspaceId}/${filename}`
  }))
}));

import { processDueVideoGenerationJobs, queueVideoGeneration } from "../src/media/video-generation-service";
import { attachMediaToContent } from "../src/media/media-service";
import { updateContentItem } from "../src/content/content-service";
import { retryMediaGenerationJob } from "../src/media/video-generation-service";
import { env } from "../src/config/env";
import { AiServiceRequestError } from "../src/ai/request";

describe("durable video generation", () => {
  beforeEach(() => {
    provider.download.mockReset();
    provider.status.mockReset();
    provider.start.mockReset();
  });

  it.each(["AI_PROVIDER_TIMEOUT", "AI_SERVICE_TIMEOUT", "AI_SERVICE_RESPONSE_INVALID"])(
    "stops an ambiguous %s submission until an intentional retry",
    async (code) => {
      const { content, workspace } = await createVideoWorkspace();
      const job = await queueVideoGeneration(workspace.id, content.id, generationInput(content));
      const now = new Date(Date.now() + 1000);
      provider.start.mockRejectedValueOnce(new AiServiceRequestError({ code, message: "Request failed", retryable: true, statusCode: 504 }));
      await processDueVideoGenerationJobs({ limit: 1, now });
      await expect(prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: job.id } })).resolves.toMatchObject({
        status: "FAILED",
        providerJobId: null,
        errorCode: "AI_VIDEO_START_RESULT_UNKNOWN",
        errorMessage: expect.stringContaining("another charge")
      });
      await processDueVideoGenerationJobs({ limit: 1, now: new Date(now.getTime() + 300_000) });
      expect(provider.start).toHaveBeenCalledOnce();
      const retried = await retryMediaGenerationJob(workspace.id, job.id, (await getContentAggregate(workspace.id, content.id)).revision);
      provider.start.mockResolvedValueOnce(providerState("in_progress"));
      await processDueVideoGenerationJobs({ limit: 1, now: new Date(Date.now() + 1000) });
      expect(provider.start).toHaveBeenCalledTimes(2);
      await expect(prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: retried.id } })).resolves.toMatchObject({
        status: "GENERATING",
        errorCode: null
      });
      await prisma.mediaGenerationJob.updateMany({ where: { contentItemId: content.id }, data: { status: "CANCELLED" } });
    }
  );

  it("does not submit a recovered STARTING job whose provider identity was never saved", async () => {
    const { content, workspace } = await createVideoWorkspace();
    const job = await queueVideoGeneration(workspace.id, content.id, generationInput(content));
    const now = new Date(Date.now() + 1000);
    await prisma.mediaGenerationJob.update({ where: { id: job.id }, data: { status: "STARTING", attempts: 1, leaseExpiresAt: new Date(now.getTime() - 1) } });
    await processDueVideoGenerationJobs({ limit: 1, now });
    expect(provider.start).not.toHaveBeenCalled();
    await expect(prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: job.id } })).resolves.toMatchObject({
      status: "FAILED",
      errorCode: "AI_VIDEO_START_RESULT_UNKNOWN"
    });
  });

  it.each(["status", "download"] as const)("retries a %s timeout against the saved video without starting another generation", async (stage) => {
    const { content, workspace } = await createVideoWorkspace();
    const job = await queueVideoGeneration(workspace.id, content.id, generationInput(content));
    const now = new Date(Date.now() + 1000);
    provider.start.mockResolvedValueOnce(providerState(stage === "download" ? "completed" : "in_progress"));
    provider[stage].mockRejectedValueOnce(new AiServiceRequestError({ code: "AI_PROVIDER_TIMEOUT", message: "Timed out", retryable: true, statusCode: 504 }));
    await processDueVideoGenerationJobs({ limit: 1, now });
    if (stage === "status") await processDueVideoGenerationJobs({ limit: 1, now: new Date(now.getTime() + 60_000) });
    const waiting = await prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(waiting).toMatchObject({ providerJobId: "video-provider-job", errorCode: "AI_PROVIDER_TIMEOUT" });
    expect(waiting.status).not.toBe("FAILED");
    provider.status.mockResolvedValueOnce(providerState("completed"));
    provider.download.mockResolvedValueOnce(Buffer.from("video-bytes"));
    await processDueVideoGenerationJobs({ limit: 1, now: new Date(now.getTime() + 120_000) });
    expect(provider.start).toHaveBeenCalledOnce();
    expect(provider.status).toHaveBeenLastCalledWith("video-provider-job");
    await expect(prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: job.id } })).resolves.toMatchObject({ status: "COMPLETED" });
  });

  it("retries an explicit rate-limit rejection instead of treating it as an accepted video", async () => {
    const { content, workspace } = await createVideoWorkspace();
    const job = await queueVideoGeneration(workspace.id, content.id, generationInput(content));
    const now = new Date(Date.now() + 1000);
    provider.start.mockRejectedValueOnce(
      new AiServiceRequestError({ code: "AI_PROVIDER_RATE_LIMITED", message: "Rate limited", retryable: true, statusCode: 503 })
    );
    await processDueVideoGenerationJobs({ limit: 1, now });
    await expect(prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: job.id } })).resolves.toMatchObject({
      status: "QUEUED",
      errorCode: "AI_PROVIDER_RATE_LIMITED"
    });
    provider.start.mockResolvedValueOnce(providerState("in_progress"));
    await processDueVideoGenerationJobs({ limit: 1, now: new Date(now.getTime() + 60_000) });
    expect(provider.start).toHaveBeenCalledTimes(2);
    await prisma.mediaGenerationJob.updateMany({ where: { contentItemId: content.id }, data: { status: "CANCELLED" } });
  });

  it.each(["response", "error"])("does not let a stale worker's %s overwrite a newer claim", async (outcome) => {
    const { content, workspace } = await createVideoWorkspace();
    const job = await queueVideoGeneration(workspace.id, content.id, generationInput(content));
    provider.start.mockImplementationOnce(async () => {
      const claimed = await prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(claimed.leaseExpiresAt!.getTime() - claimed.leasedAt!.getTime()).toBeGreaterThan(env.AI_HTTP_TIMEOUT_MS);
      // A cancellation/retry or recovery claim supersedes the old provider request.
      // Reusing the attempt number proves leasedAt also fences old ownership.
      await prisma.mediaGenerationJob.update({
        where: { id: job.id },
        data: {
          leasedAt: new Date(claimed.leasedAt!.getTime() + 1),
          providerJobId: "new-owner-provider-job",
          status: "GENERATING",
          progress: 65
        }
      });
      if (outcome === "error") throw new Error("Old request failed");
      return providerState("in_progress");
    });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    expect(await processDueVideoGenerationJobs({ limit: 1, now: new Date(Date.now() + 1000), logger })).toEqual({
      completed: 0,
      failed: 0,
      processed: 1,
      waiting: 1
    });
    await expect(prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: job.id } })).resolves.toMatchObject({
      status: "GENERATING",
      providerJobId: "new-owner-provider-job",
      progress: 65,
      errorCode: null
    });
    expect(provider.download).not.toHaveBeenCalled();
    await prisma.mediaGenerationJob.updateMany({ where: { contentItemId: content.id }, data: { status: "CANCELLED" } });
  });

  it("rejects stale duplicate dispatch, survives provider polling, and attaches the completed MP4", async () => {
    const { content, workspace } = await createVideoWorkspace();
    provider.start.mockResolvedValue({
      provider_job_id: "video-provider-job",
      status: "in_progress",
      progress: 25,
      model: "sora-2",
      duration_seconds: 8,
      width: 720,
      height: 1280
    });
    provider.status.mockResolvedValue({
      provider_job_id: "video-provider-job",
      status: "completed",
      progress: 100,
      model: "sora-2",
      duration_seconds: 8,
      width: 720,
      height: 1280
    });
    provider.download.mockResolvedValue(Buffer.from("video-bytes"));

    const first = await queueVideoGeneration(workspace.id, content.id, generationInput(content));
    await expect(queueVideoGeneration(workspace.id, content.id, generationInput(content))).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
    const firstTick = await processDueVideoGenerationJobs({ limit: 1, now: new Date(Date.now() + 1_000) });
    const waiting = await prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: first.id } });
    await prisma.mediaGenerationJob.update({
      where: { id: first.id },
      data: { nextAttemptAt: new Date(Date.now() - 1_000) }
    });
    const secondTick = await processDueVideoGenerationJobs({ limit: 1, now: new Date() });
    const [completed, contentAfter, interaction, usage] = await Promise.all([
      prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: first.id } }),
      getContentAggregate(workspace.id, content.id),
      prisma.aiInteraction.findFirstOrThrow({ where: { workspaceId: workspace.id, agent: "VIDEO" } }),
      prisma.usageCounter.findFirstOrThrow({ where: { workspaceId: workspace.id, metric: "AI_GENERATION" } })
    ]);
    const media = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: completed.outputMediaAssetId! } });

    expect(firstTick).toEqual({ completed: 0, failed: 0, processed: 1, waiting: 1 });
    expect(waiting).toMatchObject({ providerJobId: "video-provider-job", progress: 25, status: "GENERATING" });
    expect(secondTick).toEqual({ completed: 1, failed: 0, processed: 1, waiting: 0 });
    expect(completed).toMatchObject({ progress: 100, status: "COMPLETED" });
    expect(media).toMatchObject({
      durationSeconds: 8,
      height: 1280,
      mimeType: "video/mp4",
      type: "AI_GENERATED",
      width: 720
    });
    expect(contentAfter.mediaItems[0]!.mediaAssetId).toBe(media.id);
    expect(interaction).toMatchObject({ accepted: true, regenerated: false });
    expect(usage.used).toBe(1n);
    expect(provider.start).toHaveBeenCalledTimes(1);
    expect(provider.status).toHaveBeenCalledWith("video-provider-job");
    expect(provider.download).toHaveBeenCalledWith("video-provider-job");
  });

  it("regenerates into the same populated Reel item", async () => {
    const { content, workspace } = await createVideoWorkspace();
    const existing = await videoAsset(workspace.id);
    const attached = await attachMediaToContent(workspace.id, content.id, {
      contentMediaItemId: content.mediaItems[0]!.id,
      mediaAssetId: existing.id,
      expectedRevision: content.revision
    });
    const job = await queueVideoGeneration(workspace.id, content.id, generationInput(attached));
    expect(job.contentMediaItemId).toBe(content.mediaItems[0]!.id);
    await prisma.mediaGenerationJob.update({ where: { id: job.id }, data: { status: "CANCELLED" } });
  });

  it("rejects a queued job before provider work if the owner changed its content type", async () => {
    const { content, workspace } = await createVideoWorkspace();
    const job = await queueVideoGeneration(workspace.id, content.id, generationInput(content));
    await convertContentAggregate(workspace.id, content.id, {
      contentType: "POST",
      expectedRevision: (await getContentAggregate(workspace.id, content.id)).revision,
      confirmDestructive: true
    });
    expect(await processDueVideoGenerationJobs({ limit: 1, now: new Date(Date.now() + 1000) })).toEqual({ completed: 0, failed: 1, processed: 1, waiting: 0 });
    await expect(prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: job.id } })).resolves.toMatchObject({
      status: "FAILED",
      errorCode: "CONTENT_MEDIA_TYPE_INCOMPATIBLE",
      outputMediaAssetId: null
    });
    expect(provider.start).not.toHaveBeenCalled();
  });

  it.each(["attachment", "type"] as const)("retains the completed video in the library after a newer %s change", async (change) => {
    const { content, workspace } = await createVideoWorkspace();
    provider.start.mockResolvedValue(providerState("in_progress"));
    provider.status.mockResolvedValue(providerState("completed"));
    provider.download.mockResolvedValue(Buffer.from("generated-video-bytes"));
    const job = await queueVideoGeneration(workspace.id, content.id, generationInput(content));
    await processDueVideoGenerationJobs({ limit: 1, now: new Date(Date.now() + 1000) });
    if (change === "attachment") {
      const ownerMedia = await videoAsset(workspace.id);
      await attachMediaToContent(workspace.id, content.id, {
        contentMediaItemId: content.mediaItems[0]!.id,
        mediaAssetId: ownerMedia.id,
        expectedRevision: (await getContentAggregate(workspace.id, content.id)).revision
      });
    }
    if (change === "type")
      await convertContentAggregate(workspace.id, content.id, {
        contentType: "POST",
        expectedRevision: (await getContentAggregate(workspace.id, content.id)).revision,
        confirmDestructive: true
      });
    const latest = await updateContentItem(workspace.id, content.id, {
      expectedRevision: (await getContentAggregate(workspace.id, content.id)).revision,
      caption: "The owner's newer caption stays exact."
    });
    await prisma.mediaGenerationJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    expect(await processDueVideoGenerationJobs({ limit: 1, now: new Date() })).toEqual({ completed: 1, failed: 0, processed: 1, waiting: 0 });
    const savedJob = await prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
    const unchanged = await getContentAggregate(workspace.id, content.id);
    expect(unchanged).toMatchObject({ caption: latest.caption, contentType: latest.contentType, mediaItems: latest.mediaItems, revision: latest.revision });
    expect(savedJob).toMatchObject({
      status: "COMPLETED",
      attachmentApplied: false,
      retryable: false,
      errorCode: "CONTENT_MEDIA_CHANGED"
    });
    expect(savedJob.errorMessage).toContain("saved in the Media Library");
    expect(savedJob.outputMediaAssetId).toBeTruthy();
    await expect(prisma.mediaAsset.findUniqueOrThrow({ where: { id: savedJob.outputMediaAssetId! } })).resolves.toMatchObject({
      workspaceId: workspace.id,
      deletedAt: null,
      mimeType: "video/mp4"
    });
    await expect(retryMediaGenerationJob(workspace.id, job.id, (await getContentAggregate(workspace.id, content.id)).revision)).rejects.toThrow(
      "Only failed video requests without an output"
    );
    expect(provider.start).toHaveBeenCalledTimes(1);
    await expect(prisma.aiInteraction.findFirstOrThrow({ where: { workspaceId: workspace.id, agent: "VIDEO" } })).resolves.toMatchObject({ accepted: false });
  });

  it.each(["in_progress", "completed", "failed", "throw"] as const)(
    "keeps terminal output recovery intact after a late %s provider response",
    async (response) => {
      const { content, workspace } = await createVideoWorkspace();
      provider.start.mockResolvedValue(providerState("in_progress"));
      const job = await queueVideoGeneration(workspace.id, content.id, generationInput(content));
      await processDueVideoGenerationJobs({ limit: 1, now: new Date(Date.now() + 1000) });
      const retained = await videoAsset(workspace.id);
      const terminalTime = new Date("2026-09-10T08:00:00.000Z");
      provider.status.mockImplementation(async () => {
        // Another worker finishes while this worker's provider request is in flight.
        await prisma.mediaGenerationJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            outputMediaAssetId: retained.id,
            errorCode: "CONTENT_MEDIA_SINGLE_ITEM_LIMIT",
            errorMessage: "The generated file is saved in the Media Library.",
            retryable: false,
            completedAt: terminalTime,
            nextAttemptAt: terminalTime,
            leasedAt: null,
            leaseExpiresAt: null
          }
        });
        if (response === "throw") throw new Error("Late provider response failed");
        return { ...providerState("completed"), status: response, error_code: "LATE_FAILURE", error_message: "Late failure" };
      });
      await prisma.mediaGenerationJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
      await processDueVideoGenerationJobs({ limit: 1, now: new Date() });
      await expect(prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: job.id } })).resolves.toMatchObject({
        status: "FAILED",
        outputMediaAssetId: retained.id,
        errorCode: "CONTENT_MEDIA_SINGLE_ITEM_LIMIT",
        errorMessage: "The generated file is saved in the Media Library.",
        retryable: false,
        completedAt: terminalTime,
        nextAttemptAt: terminalTime
      });
      expect(provider.download).not.toHaveBeenCalled();
      expect(await prisma.mediaAsset.count({ where: { workspaceId: workspace.id } })).toBe(1);
      await expect(getContentAggregate(workspace.id, content.id)).resolves.toMatchObject({ mediaItems: [expect.objectContaining({ mediaAssetId: null })] });
    }
  );
});

function generationInput(content: ContentRecord) {
  return {
    contentMediaItemId: content.mediaItems[0]!.id,
    expectedRevision: content.revision,
    aspectRatio: "9:16" as const,
    durationSeconds: 8 as const,
    prompt: "A vertical close-up of a fresh snack being plated"
  };
}

function providerState(status: "in_progress" | "completed") {
  return {
    provider_job_id: "video-provider-job",
    status,
    progress: status === "completed" ? 100 : 25,
    model: "test-video",
    duration_seconds: 8,
    width: 720,
    height: 1280
  };
}

async function videoAsset(workspaceId: string) {
  const id = randomUUID();
  return prisma.mediaAsset.create({
    data: {
      workspaceId,
      type: "VIDEO",
      filename: `${id}.mp4`,
      mimeType: "video/mp4",
      s3Key: `external:https://cdn.example.com/${id}.mp4`,
      cdnUrl: `https://cdn.example.com/${id}.mp4`,
      sizeBytes: 1000,
      width: 720,
      height: 1280,
      durationSeconds: 8
    }
  });
}

async function createVideoWorkspace() {
  const suffix = randomUUID();
  const plan = await prisma.plan.upsert({
    where: { code: "TEST_VIDEO_GENERATION" },
    create: {
      code: "TEST_VIDEO_GENERATION",
      currency: "BHD",
      name: "Test video generation",
      priceMinor: 0,
      limits: {
        aiGenerations: 100,
        aiImages: 20,
        aiInputTokens: 1_000_000,
        aiOutputTokens: 500_000,
        campaigns: 10,
        posts: 100,
        storageBytes: 1_000_000_000,
        workspaces: 1
      }
    },
    update: { active: true }
  });
  const user = await prisma.user.create({
    data: {
      email: `video-generation-${suffix}@markos.test`,
      fullName: "Video Generation User",
      locale: "EN",
      planId: plan.id
    }
  });
  const workspace = await prisma.workspace.create({
    data: {
      name: "Video Generation Workspace",
      ownerUserId: user.id,
      slug: `video-generation-${suffix}`
    }
  });
  const content = await prisma.$transaction((tx) =>
    createContentAggregate(tx, workspace.id, { platform: "INSTAGRAM", contentType: "REEL", caption: "Freshly made" })
  );

  return { content, workspace };
}
