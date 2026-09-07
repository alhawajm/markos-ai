import type { MediaGenerationJob, MediaGenerationStatus, Prisma } from "@prisma/client";
import type { MediaGenerationJobRecord } from "@markos/shared-types";
import type { GenerateVideoForContentInput } from "@markos/validation";
import { downloadGeneratedVideo, getVideoGenerationStatus, startVideoGeneration, type VideoProviderJob } from "../ai/video-client";
import { AiServiceRequestError } from "../ai/request";
import { prisma } from "../db/prisma";
import { refundWorkspaceUsage, reserveWorkspaceUsage } from "../usage/usage-service";
import { deleteStoredMedia, storeWorkspaceMedia } from "./storage-service";
import { MediaContentItemNotFoundError, MediaContentLockedError } from "./media-service";

const pollDelayMs = 15_000;
const retryDelayMs = 30_000;
const leaseMs = 2 * 60_000;
const localCurrency = "BHD";

export class MediaVideoGenerationUnsupportedError extends Error {
  constructor() {
    super("AI video generation is available for Reels and Stories");
  }
}

export class MediaGenerationJobNotFoundError extends Error {
  constructor() {
    super("Media generation job was not found");
  }
}

export class MediaGenerationJobStateError extends Error {
  constructor(message = "Media generation job cannot be changed in its current state") {
    super(message);
  }
}

export async function queueVideoGeneration(workspaceId: string, contentItemId: string, input: GenerateVideoForContentInput): Promise<MediaGenerationJobRecord> {
  const content = await prisma.contentItem.findFirst({
    where: { id: contentItemId, workspaceId, deletedAt: null }
  });
  if (!content) throw new MediaContentItemNotFoundError();
  if (!["DRAFT", "IN_REVIEW", "APPROVED"].includes(content.status)) throw new MediaContentLockedError();
  if (content.contentType !== "REEL" && content.contentType !== "STORY") throw new MediaVideoGenerationUnsupportedError();

  const active = await prisma.mediaGenerationJob.findFirst({
    where: {
      contentItemId,
      workspaceId,
      status: { in: ["QUEUED", "STARTING", "GENERATING", "PROCESSING"] }
    },
    orderBy: { createdAt: "desc" }
  });
  if (active) return toMediaGenerationJobRecord(active);

  const quotaDate = new Date();
  await reserveWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: quotaDate });
  try {
    return toMediaGenerationJobRecord(
      await prisma.mediaGenerationJob.create({
        data: {
          workspaceId,
          contentItemId,
          prompt: input.prompt,
          aspectRatio: input.aspectRatio,
          durationSeconds: input.durationSeconds
        }
      })
    );
  } catch (error) {
    await refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: quotaDate });
    if (isUniqueConstraintError(error)) {
      const raced = await prisma.mediaGenerationJob.findFirst({
        where: {
          contentItemId,
          workspaceId,
          status: { in: ["QUEUED", "STARTING", "GENERATING", "PROCESSING"] }
        },
        orderBy: { createdAt: "desc" }
      });
      if (raced) return toMediaGenerationJobRecord(raced);
    }
    throw error;
  }
}

export async function getMediaGenerationJob(workspaceId: string, jobId: string): Promise<MediaGenerationJobRecord> {
  const job = await prisma.mediaGenerationJob.findFirst({ where: { id: jobId, workspaceId } });
  if (!job) throw new MediaGenerationJobNotFoundError();
  return toMediaGenerationJobRecord(job);
}

export async function getLatestMediaGenerationJob(workspaceId: string, contentItemId: string): Promise<MediaGenerationJobRecord | null> {
  const job = await prisma.mediaGenerationJob.findFirst({
    where: { contentItemId, workspaceId },
    orderBy: { createdAt: "desc" }
  });
  return job ? toMediaGenerationJobRecord(job) : null;
}

export async function cancelMediaGenerationJob(workspaceId: string, jobId: string): Promise<MediaGenerationJobRecord> {
  const job = await prisma.mediaGenerationJob.findFirst({ where: { id: jobId, workspaceId } });
  if (!job) throw new MediaGenerationJobNotFoundError();
  if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) throw new MediaGenerationJobStateError();

  const cancelled = await prisma.mediaGenerationJob.update({
    where: { id: job.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      leaseExpiresAt: null,
      leasedAt: null
    }
  });
  if (!job.providerJobId) {
    await refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: job.createdAt });
  }
  return toMediaGenerationJobRecord(cancelled);
}

export async function retryMediaGenerationJob(workspaceId: string, jobId: string): Promise<MediaGenerationJobRecord> {
  const job = await prisma.mediaGenerationJob.findFirst({ where: { id: jobId, workspaceId } });
  if (!job) throw new MediaGenerationJobNotFoundError();
  if (job.status !== "FAILED") throw new MediaGenerationJobStateError("Only failed video jobs can be retried");

  const active = await prisma.mediaGenerationJob.findFirst({
    where: {
      contentItemId: job.contentItemId,
      workspaceId,
      status: { in: ["QUEUED", "STARTING", "GENERATING", "PROCESSING"] }
    }
  });
  if (active) return toMediaGenerationJobRecord(active);

  const quotaDate = new Date();
  await reserveWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: quotaDate });
  try {
    return toMediaGenerationJobRecord(
      await prisma.mediaGenerationJob.update({
        where: { id: job.id },
        data: {
          status: "QUEUED",
          providerJobId: null,
          progress: 0,
          errorCode: null,
          errorMessage: null,
          retryable: null,
          attempts: 0,
          nextAttemptAt: quotaDate,
          leasedAt: null,
          leaseExpiresAt: null,
          completedAt: null,
          cancelledAt: null
        }
      })
    );
  } catch (error) {
    await refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: quotaDate });
    throw error;
  }
}

export interface VideoGenerationWorkerResult {
  completed: number;
  failed: number;
  processed: number;
  waiting: number;
}

export async function processDueVideoGenerationJobs(input: { limit?: number; now?: Date } = {}): Promise<VideoGenerationWorkerResult> {
  const now = input.now ?? new Date();
  const result: VideoGenerationWorkerResult = { completed: 0, failed: 0, processed: 0, waiting: 0 };
  const limit = input.limit ?? 5;

  for (let index = 0; index < limit; index += 1) {
    const job = await claimVideoGenerationJob(now);
    if (!job) break;
    result.processed += 1;

    try {
      const outcome = await processClaimedJob(job, now);
      result[outcome] += 1;
    } catch (error) {
      const outcome = await handleWorkerError(job, error, now);
      result[outcome] += 1;
    }
  }

  return result;
}

async function claimVideoGenerationJob(now: Date): Promise<MediaGenerationJob | undefined> {
  const candidate = await prisma.mediaGenerationJob.findFirst({
    where: {
      status: { in: ["QUEUED", "STARTING", "GENERATING", "PROCESSING"] },
      nextAttemptAt: { lte: now },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }]
    },
    orderBy: { nextAttemptAt: "asc" }
  });
  if (!candidate) return undefined;

  const claimed = await prisma.mediaGenerationJob.updateMany({
    where: {
      id: candidate.id,
      status: candidate.status,
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }]
    },
    data: {
      leasedAt: now,
      leaseExpiresAt: new Date(now.getTime() + leaseMs),
      attempts: { increment: 1 }
    }
  });
  if (claimed.count !== 1) return undefined;
  return prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: candidate.id } });
}

async function processClaimedJob(job: MediaGenerationJob, now: Date): Promise<"completed" | "failed" | "waiting"> {
  if (!job.providerJobId) {
    await prisma.mediaGenerationJob.update({ where: { id: job.id }, data: { status: "STARTING" } });
    const started = await startVideoGeneration({
      workspaceId: job.workspaceId,
      prompt: job.prompt,
      durationSeconds: toDuration(job.durationSeconds)
    });
    return persistProviderState(job, started, now);
  }

  const providerJob = await getVideoGenerationStatus(job.providerJobId);
  return persistProviderState(job, providerJob, now);
}

async function persistProviderState(job: MediaGenerationJob, providerJob: VideoProviderJob, now: Date): Promise<"completed" | "failed" | "waiting"> {
  if (providerJob.status === "failed") {
    await markJobFailed(
      job,
      providerJob.error_code ?? "AI_VIDEO_GENERATION_FAILED",
      providerJob.error_message ?? "Video generation failed",
      providerJob.retryable ?? false
    );
    return "failed";
  }

  if (providerJob.status !== "completed") {
    await prisma.mediaGenerationJob.updateMany({
      where: { id: job.id, status: { not: "CANCELLED" } },
      data: {
        providerJobId: providerJob.provider_job_id,
        status: "GENERATING",
        progress: providerJob.progress,
        model: providerJob.model,
        durationSeconds: providerJob.duration_seconds,
        nextAttemptAt: new Date(now.getTime() + pollDelayMs),
        leasedAt: null,
        leaseExpiresAt: null,
        errorCode: null,
        errorMessage: null,
        retryable: null
      }
    });
    return "waiting";
  }

  await prisma.mediaGenerationJob.updateMany({
    where: { id: job.id, status: { not: "CANCELLED" } },
    data: { status: "PROCESSING", progress: 100, providerJobId: providerJob.provider_job_id, model: providerJob.model }
  });
  const video = await downloadGeneratedVideo(providerJob.provider_job_id);
  await completeVideoJob(job, providerJob, video, now);
  return "completed";
}

async function completeVideoJob(job: MediaGenerationJob, providerJob: VideoProviderJob, video: Buffer, now: Date): Promise<void> {
  await reserveWorkspaceUsage({ workspaceId: job.workspaceId, metric: "STORAGE_BYTES", amount: video.byteLength, now });
  let stored: Awaited<ReturnType<typeof storeWorkspaceMedia>> | undefined;
  try {
    stored = await storeWorkspaceMedia({
      workspaceId: job.workspaceId,
      filename: `markos-ai-${job.id}.mp4`,
      contentType: "video/mp4",
      bytes: video
    });
    await prisma.$transaction(async (tx) => {
      const currentJob = await tx.mediaGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
      if (currentJob.status === "CANCELLED") throw new MediaGenerationJobStateError("Video generation was cancelled");
      const content = await tx.contentItem.findFirstOrThrow({ where: { id: job.contentItemId, workspaceId: job.workspaceId, deletedAt: null } });
      const mediaAsset = await tx.mediaAsset.create({
        data: {
          workspaceId: job.workspaceId,
          type: "AI_GENERATED",
          filename: `markos-ai-${job.id}.mp4`,
          s3Key: stored?.key ?? "",
          cdnUrl: stored?.publicUrl ?? "",
          mimeType: "video/mp4",
          sizeBytes: video.byteLength,
          width: providerJob.width,
          height: providerJob.height,
          durationSeconds: providerJob.duration_seconds
        }
      });
      await tx.contentItem.update({
        where: { id: content.id },
        data: { mediaIds: [...new Set([...content.mediaIds, mediaAsset.id])] }
      });
      await tx.aiInteraction.create({
        data: {
          workspaceId: job.workspaceId,
          agent: "VIDEO",
          promptVersion: "video.v1.openai",
          prompt: { prompt: job.prompt, aspectRatio: job.aspectRatio, durationSeconds: job.durationSeconds },
          response: {
            status: providerJob.status,
            model: providerJob.model,
            width: providerJob.width,
            height: providerJob.height,
            durationSeconds: providerJob.duration_seconds,
            mediaAssetId: mediaAsset.id
          },
          accepted: true,
          edited: false,
          regenerated: false,
          tokensIn: 0,
          tokensOut: 0,
          costMinor: 0,
          currency: localCurrency,
          model: providerJob.model
        }
      });
      await tx.mediaGenerationJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          outputMediaAssetId: mediaAsset.id,
          completedAt: now,
          progress: 100,
          nextAttemptAt: now,
          leasedAt: null,
          leaseExpiresAt: null,
          errorCode: null,
          errorMessage: null,
          retryable: null
        }
      });
    });
  } catch (error) {
    if (stored) await deleteStoredMedia(job.workspaceId, stored.key).catch(() => undefined);
    await refundWorkspaceUsage({ workspaceId: job.workspaceId, metric: "STORAGE_BYTES", amount: video.byteLength, now });
    throw error;
  }
}

async function handleWorkerError(job: MediaGenerationJob, error: unknown, now: Date): Promise<"failed" | "waiting"> {
  if (error instanceof AiServiceRequestError && !error.retryable) {
    await markJobFailed(job, error.code, error.message, false);
    return "failed";
  }
  const code = error instanceof AiServiceRequestError ? error.code : "AI_VIDEO_PROCESSING_FAILED";
  const message = error instanceof Error ? error.message : "Video generation could not be completed";
  await prisma.mediaGenerationJob.updateMany({
    where: { id: job.id, status: { not: "CANCELLED" } },
    data: {
      nextAttemptAt: new Date(now.getTime() + retryDelayMs),
      leasedAt: null,
      leaseExpiresAt: null,
      errorCode: code,
      errorMessage: message,
      retryable: true
    }
  });
  return "waiting";
}

async function markJobFailed(job: MediaGenerationJob, code: string, message: string, retryable: boolean): Promise<void> {
  const updated = await prisma.mediaGenerationJob.updateMany({
    where: { id: job.id, status: { not: "CANCELLED" } },
    data: {
      status: "FAILED",
      errorCode: code,
      errorMessage: message,
      retryable,
      leasedAt: null,
      leaseExpiresAt: null
    }
  });
  if (updated.count === 1) {
    await refundWorkspaceUsage({ workspaceId: job.workspaceId, metric: "AI_GENERATION", now: job.createdAt });
  }
}

function toDuration(value: number): 4 | 8 | 12 {
  return value === 4 || value === 12 ? value : 8;
}

export function toMediaGenerationJobRecord(job: MediaGenerationJob): MediaGenerationJobRecord {
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    contentItemId: job.contentItemId,
    kind: job.kind,
    status: job.status,
    prompt: job.prompt,
    aspectRatio: "9:16",
    durationSeconds: toDuration(job.durationSeconds),
    progress: job.progress,
    ...(job.model ? { model: job.model } : {}),
    ...(job.errorCode ? { errorCode: job.errorCode } : {}),
    ...(job.errorMessage ? { errorMessage: job.errorMessage } : {}),
    ...(job.retryable === null ? {} : { retryable: job.retryable }),
    ...(job.outputMediaAssetId ? { outputMediaAssetId: job.outputMediaAssetId } : {}),
    ...(job.completedAt ? { completedAt: job.completedAt.toISOString() } : {}),
    ...(job.cancelledAt ? { cancelledAt: job.cancelledAt.toISOString() } : {}),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString()
  };
}

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}
