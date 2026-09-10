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

describe("durable video generation", () => {
  beforeEach(() => {
    provider.download.mockReset();
    provider.status.mockReset();
    provider.start.mockReset();
  });

  it("keeps one active job, survives provider polling, and attaches the completed MP4", async () => {
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

    const first = await queueVideoGeneration(workspace.id, content.id, {
      aspectRatio: "9:16",
      durationSeconds: 8,
      prompt: "A vertical close-up of a fresh snack being plated"
    });
    const duplicate = await queueVideoGeneration(workspace.id, content.id, {
      aspectRatio: "9:16",
      durationSeconds: 8,
      prompt: "This duplicate request must not create another job"
    });
    const firstTick = await processDueVideoGenerationJobs({ limit: 1, now: new Date(Date.now() + 1_000) });
    const waiting = await prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: first.id } });
    await prisma.mediaGenerationJob.update({
      where: { id: first.id },
      data: { nextAttemptAt: new Date(Date.now() - 1_000) }
    });
    const secondTick = await processDueVideoGenerationJobs({ limit: 1, now: new Date() });
    const [completed, contentAfter, interaction, usage] = await Promise.all([
      prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: first.id } }),
      prisma.contentItem.findUniqueOrThrow({ where: { id: content.id } }),
      prisma.aiInteraction.findFirstOrThrow({ where: { workspaceId: workspace.id, agent: "VIDEO" } }),
      prisma.usageCounter.findFirstOrThrow({ where: { workspaceId: workspace.id, metric: "AI_GENERATION" } })
    ]);
    const media = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: completed.outputMediaAssetId! } });

    expect(duplicate.id).toBe(first.id);
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
    expect(contentAfter.mediaIds).toContain(media.id);
    expect(interaction).toMatchObject({ accepted: true, regenerated: false });
    expect(usage.used).toBe(1n);
    expect(provider.start).toHaveBeenCalledTimes(1);
    expect(provider.status).toHaveBeenCalledWith("video-provider-job");
    expect(provider.download).toHaveBeenCalledWith("video-provider-job");
  });

  it("rejects a full Reel before queueing or calling the provider", async () => {
    const { content, workspace } = await createVideoWorkspace();
    const existing = await videoAsset(workspace.id);
    await attachMediaToContent(workspace.id, content.id, existing.id);
    await expect(queueVideoGeneration(workspace.id, content.id, generationInput())).rejects.toMatchObject({ code: "CONTENT_MEDIA_SINGLE_ITEM_LIMIT" });
    expect(await prisma.mediaGenerationJob.count({ where: { contentItemId: content.id } })).toBe(0);
    expect(provider.start).not.toHaveBeenCalled();
  });

  it("rejects a queued job before provider work if the owner changed its content type", async () => {
    const { content, workspace } = await createVideoWorkspace();
    const job = await queueVideoGeneration(workspace.id, content.id, generationInput());
    await updateContentItem(workspace.id, content.id, { contentType: "POST" });
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
    const job = await queueVideoGeneration(workspace.id, content.id, generationInput());
    await processDueVideoGenerationJobs({ limit: 1, now: new Date(Date.now() + 1000) });
    if (change === "attachment") {
      const ownerMedia = await videoAsset(workspace.id);
      await attachMediaToContent(workspace.id, content.id, ownerMedia.id);
    }
    const latest = await updateContentItem(workspace.id, content.id, {
      caption: "The owner's newer caption stays exact.",
      ...(change === "type" ? { contentType: "POST" as const } : {})
    });
    await prisma.mediaGenerationJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    expect(await processDueVideoGenerationJobs({ limit: 1, now: new Date() })).toEqual({ completed: 0, failed: 1, processed: 1, waiting: 0 });
    const savedJob = await prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
    const unchanged = await prisma.contentItem.findUniqueOrThrow({ where: { id: content.id } });
    expect(unchanged).toMatchObject({ caption: latest.caption, contentType: latest.contentType, mediaIds: latest.mediaIds, revision: latest.revision });
    expect(savedJob).toMatchObject({
      status: "FAILED",
      retryable: false,
      errorCode: change === "attachment" ? "CONTENT_MEDIA_SINGLE_ITEM_LIMIT" : "CONTENT_MEDIA_TYPE_INCOMPATIBLE"
    });
    expect(savedJob.errorMessage).toContain("saved in the Media Library");
    expect(savedJob.outputMediaAssetId).toBeTruthy();
    await expect(prisma.mediaAsset.findUniqueOrThrow({ where: { id: savedJob.outputMediaAssetId! } })).resolves.toMatchObject({
      workspaceId: workspace.id,
      deletedAt: null,
      mimeType: "video/mp4"
    });
    await expect(retryMediaGenerationJob(workspace.id, job.id)).rejects.toThrow("already saved in the Media Library");
    expect(provider.start).toHaveBeenCalledTimes(1);
    await expect(prisma.aiInteraction.findFirstOrThrow({ where: { workspaceId: workspace.id, agent: "VIDEO" } })).resolves.toMatchObject({ accepted: false });
  });

  it.each(["in_progress", "completed", "failed", "throw"] as const)(
    "keeps terminal output recovery intact after a late %s provider response",
    async (response) => {
      const { content, workspace } = await createVideoWorkspace();
      provider.start.mockResolvedValue(providerState("in_progress"));
      const job = await queueVideoGeneration(workspace.id, content.id, generationInput());
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
      await expect(prisma.contentItem.findUniqueOrThrow({ where: { id: content.id } })).resolves.toMatchObject({ mediaIds: [] });
    }
  );
});

function generationInput() {
  return { aspectRatio: "9:16" as const, durationSeconds: 8 as const, prompt: "A vertical close-up of a fresh snack being plated" };
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
  const content = await prisma.contentItem.create({
    data: {
      workspaceId: workspace.id,
      contentType: "REEL",
      status: "DRAFT",
      caption: "Freshly made",
      mediaIds: []
    }
  });

  return { content, workspace };
}
