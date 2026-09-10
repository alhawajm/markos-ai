import type { MediaGenerationJob, MediaGenerationStatus, Prisma } from "@prisma/client";
import type { MediaGenerationJobRecord } from "@markos/shared-types";
import type { GenerateVideoForContentInput } from "@markos/validation";
import { downloadGeneratedVideo, getVideoGenerationStatus, startVideoGeneration, type VideoProviderJob } from "../ai/video-client";
import { AiServiceRequestError } from "../ai/request";
import { prisma } from "../db/prisma";
import { refundWorkspaceUsage, reserveWorkspaceUsage } from "../usage/usage-service";
import { deleteStoredMedia, storeWorkspaceMedia } from "./storage-service";
import { MediaContentItemNotFoundError, MediaContentLockedError } from "./media-service";
import { assertStoredContentMedia, ContentMediaValidationError, lockContentForMedia, validateStoredContentMedia } from "./content-media-integrity";

const pollDelayMs = 15_000;
const retryDelayMs = 30_000;
const leaseMs = 2 * 60_000;
const localCurrency = "BHD";
const activeJobStatuses: MediaGenerationStatus[] = ["QUEUED", "STARTING", "GENERATING", "PROCESSING"];

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
  if (!["DRAFT", "IN_REVIEW"].includes(content.status)) throw new MediaContentLockedError();
  if (content.contentType !== "REEL" && content.contentType !== "STORY") throw new MediaVideoGenerationUnsupportedError();
  await assertStoredContentMedia(prisma, content, { addition: { id: "pending-generated-video", mimeType: "video/mp4" } });

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

  const result = await prisma.mediaGenerationJob.updateMany({
    where: { id: job.id, status: { in: activeJobStatuses } },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      leaseExpiresAt: null,
      leasedAt: null
    }
  });
  if (result.count !== 1) throw new MediaGenerationJobStateError();
  const cancelled = await prisma.mediaGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
  if (!job.providerJobId) {
    await refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: job.createdAt });
  }
  return toMediaGenerationJobRecord(cancelled);
}

export async function retryMediaGenerationJob(workspaceId: string, jobId: string): Promise<MediaGenerationJobRecord> {
  const job = await prisma.mediaGenerationJob.findFirst({ where: { id: jobId, workspaceId } });
  if (!job) throw new MediaGenerationJobNotFoundError();
  if (job.status !== "FAILED") throw new MediaGenerationJobStateError("Only failed video jobs can be retried");
  if (job.outputMediaAssetId)
    throw new MediaGenerationJobStateError("The generated video is already saved in the Media Library. Attach that file after removing incompatible media.");
  const content = await prisma.contentItem.findFirst({ where: { id: job.contentItemId, workspaceId, deletedAt: null } });
  if (!content) throw new MediaContentItemNotFoundError();
  if (!["DRAFT", "IN_REVIEW"].includes(content.status)) throw new MediaContentLockedError();
  if (content.contentType !== "REEL" && content.contentType !== "STORY") throw new MediaVideoGenerationUnsupportedError();
  await assertStoredContentMedia(prisma, content, { addition: { id: "pending-generated-video", mimeType: "video/mp4" } });

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
        where: { id: job.id, status: "FAILED", outputMediaAssetId: null },
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
    const content = await prisma.contentItem.findFirst({ where: { id: job.contentItemId, workspaceId: job.workspaceId, deletedAt: null } });
    if (!content) throw new MediaContentItemNotFoundError();
    if (!["DRAFT", "IN_REVIEW"].includes(content.status)) throw new MediaContentLockedError();
    if (content.contentType !== "REEL" && content.contentType !== "STORY") throw new MediaVideoGenerationUnsupportedError();
    await assertStoredContentMedia(prisma, content, { addition: { id: "pending-generated-video", mimeType: "video/mp4" } });
    const starting = await prisma.mediaGenerationJob.updateMany({ where: { id: job.id, status: { in: activeJobStatuses } }, data: { status: "STARTING" } });
    if (starting.count !== 1) return "waiting";
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
      where: { id: job.id, status: { in: activeJobStatuses } },
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

  const processing = await prisma.mediaGenerationJob.updateMany({
    where: { id: job.id, status: { in: activeJobStatuses } },
    data: { status: "PROCESSING", progress: 100, providerJobId: providerJob.provider_job_id, model: providerJob.model }
  });
  if (processing.count !== 1) return "waiting";
  const video = await downloadGeneratedVideo(providerJob.provider_job_id);
  return completeVideoJob(job, providerJob, video, now);
}

async function completeVideoJob(job: MediaGenerationJob, providerJob: VideoProviderJob, video: Buffer, now: Date): Promise<"completed" | "failed"> {
  await reserveWorkspaceUsage({ workspaceId: job.workspaceId, metric: "STORAGE_BYTES", amount: video.byteLength, now });
  let stored: Awaited<ReturnType<typeof storeWorkspaceMedia>> | undefined;
  try {
    stored = await storeWorkspaceMedia({
      workspaceId: job.workspaceId,
      filename: `markos-ai-${job.id}.mp4`,
      contentType: "video/mp4",
      bytes: video
    });
    return await prisma.$transaction(async (tx) => {
      const content = await lockContentForMedia(tx, job.workspaceId, job.contentItemId);
      await tx.$queryRaw`SELECT "id" FROM "media_generation_jobs" WHERE "id" = ${job.id}::uuid FOR UPDATE`;
      const currentJob = await tx.mediaGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
      if (!activeJobStatuses.includes(currentJob.status)) throw new MediaGenerationJobStateError("Video generation is no longer active");
      if (currentJob.outputMediaAssetId) throw new MediaGenerationJobStateError("The generated video was already saved");
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
      const issue = !content
        ? "CONTENT_NOT_FOUND"
        : !["DRAFT", "IN_REVIEW"].includes(content.status)
          ? "CONTENT_LOCKED"
          : await validateStoredContentMedia(tx, content, { addition: mediaAsset });
      const attachmentError = issue ? new ContentMediaValidationError(issue, mediaAsset.id) : null;
      if (content && !attachmentError) {
        await tx.contentItem.update({ where: { id: content.id }, data: { mediaIds: [...content.mediaIds, mediaAsset.id] } });
      }
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
          accepted: !attachmentError,
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
          status: attachmentError ? "FAILED" : "COMPLETED",
          outputMediaAssetId: mediaAsset.id,
          completedAt: now,
          progress: 100,
          nextAttemptAt: now,
          leasedAt: null,
          leaseExpiresAt: null,
          errorCode: attachmentError?.code ?? null,
          errorMessage: attachmentError?.message ?? null,
          retryable: attachmentError ? false : null
        }
      });
      return attachmentError ? "failed" : "completed";
    });
  } catch (error) {
    if (stored) await deleteStoredMedia(job.workspaceId, stored.key).catch(() => undefined);
    await refundWorkspaceUsage({ workspaceId: job.workspaceId, metric: "STORAGE_BYTES", amount: video.byteLength, now });
    throw error;
  }
}

async function handleWorkerError(job: MediaGenerationJob, error: unknown, now: Date): Promise<"failed" | "waiting"> {
  if (
    error instanceof ContentMediaValidationError ||
    error instanceof MediaContentLockedError ||
    error instanceof MediaContentItemNotFoundError ||
    error instanceof MediaVideoGenerationUnsupportedError
  ) {
    const code =
      error instanceof ContentMediaValidationError
        ? error.code
        : error instanceof MediaContentLockedError
          ? "CONTENT_LOCKED"
          : error instanceof MediaContentItemNotFoundError
            ? "CONTENT_NOT_FOUND"
            : "CONTENT_MEDIA_TYPE_INCOMPATIBLE";
    await markJobFailed(job, code, error.message, false);
    return "failed";
  }
  if (error instanceof AiServiceRequestError && !error.retryable) {
    await markJobFailed(job, error.code, error.message, false);
    return "failed";
  }
  const code = error instanceof AiServiceRequestError ? error.code : "AI_VIDEO_PROCESSING_FAILED";
  const message = error instanceof Error ? error.message : "Video generation could not be completed";
  await prisma.mediaGenerationJob.updateMany({
    where: { id: job.id, status: { in: activeJobStatuses } },
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
    where: { id: job.id, status: { in: activeJobStatuses } },
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
