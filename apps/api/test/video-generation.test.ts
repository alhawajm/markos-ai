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
});

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
      captionEn: "Freshly made",
      hashtags: [],
      mediaIds: []
    }
  });

  return { content, workspace };
}
