import { dispatchGeneration, applyGeneratedAsset } from "./generation-intent";
import type { MediaGenerationJob, MediaGenerationStatus, Prisma } from "@prisma/client";
import type { MediaGenerationJobRecord } from "@markos/shared-types";
import { motionReelOptionsSchema, type GenerateVideoForContentInput } from "@markos/validation";
import { downloadGeneratedVideo, getVideoGenerationStatus, renderMotionReel, startVideoGeneration, type VideoProviderJob } from "../ai/video-client";
import { AiServiceRequestError } from "../ai/request";
import { prisma } from "../db/prisma";
import { refundWorkspaceUsage, reserveWorkspaceUsage } from "../usage/usage-service";
import { deleteStoredMedia, readStoredMedia, storeWorkspaceMedia } from "./storage-service";
import { MediaContentItemNotFoundError, MediaContentLockedError } from "./media-service";
import { ContentMediaValidationError, lockContentForMedia } from "./content-media-integrity";
import { workerLogger, workerErrorCode, type WorkerLogger } from "../worker/worker-diagnostics";
import { env } from "../config/env";
import { prepareVideoRender, videoRenderPlanSchema, type VideoRenderPlan } from "../ai/video-plan-client";

const pollDelayMs = 15_000;
const retryDelayMs = 30_000;
const leaseMs = Math.max(2 * 60_000, env.AI_HTTP_TIMEOUT_MS + 60_000);
const localCurrency = "BHD";
const activeJobStatuses: MediaGenerationStatus[] = ["QUEUED", "STARTING", "GENERATING", "PROCESSING"];

class VideoLeaseLostError extends Error {}
class MotionArtworkError extends Error {}
const renderPlanVersion = "video-render.v1";

async function savedRenderPlan(job: MediaGenerationJob): Promise<VideoRenderPlan | undefined> {
  const interaction = await prisma.aiInteraction.findFirst({
    where: {
      workspaceId: job.workspaceId,
      contentItemId: job.contentItemId,
      agent: "VIDEO",
      promptVersion: renderPlanVersion,
      deletedAt: null,
      prompt: { path: ["generationJobId"], equals: job.id }
    }
  });
  return interaction ? videoRenderPlanSchema.parse(interaction.response) : undefined;
}

async function ensureRenderPlan(job: MediaGenerationJob, clock: () => Date): Promise<VideoRenderPlan> {
  const saved = await savedRenderPlan(job);
  if (saved) return saved;
  await renewVideoLease(job, clock());
  const prepared = await prepareVideoRender({ workspaceId: job.workspaceId, prompt: job.prompt, durationSeconds: toDuration(job.durationSeconds) });
  // Persist the exact copy and its metered planning usage before starting paid footage.
  // Reclaims/download retries use this same plan, never changed draft copy.
  await prisma.$transaction(async (tx) => {
    const renewed = await tx.mediaGenerationJob.updateMany({
      where: ownedVideoJob(job, clock()),
      data: { leaseExpiresAt: new Date(clock().getTime() + leaseMs) }
    });
    if (renewed.count !== 1) throw new VideoLeaseLostError("Video job ownership changed");
    await tx.aiInteraction.create({
      data: {
        workspaceId: job.workspaceId,
        contentItemId: job.contentItemId,
        contentRevision: job.requestedRevision,
        agent: "VIDEO",
        promptVersion: renderPlanVersion,
        prompt: { generationJobId: job.id, prompt: job.prompt },
        response: prepared.result,
        tokensIn: prepared.tokens_in,
        tokensOut: prepared.tokens_out,
        model: prepared.model,
        costMinor: 0,
        currency: localCurrency,
        accepted: true,
        edited: false,
        regenerated: false
      }
    });
  });
  return prepared.result;
}
class VideoStartResultUnknownError extends Error {
  readonly code = "AI_VIDEO_START_RESULT_UNKNOWN";
}

const videoStartUnknownMessage =
  "MARKOS could not confirm whether the provider started this video. It may still finish there. Generating again may create another video and incur another charge.";
const rejectedVideoStartCodes = new Set([
  "AI_VIDEO_GENERATION_DISABLED",
  "AI_VIDEO_MODERATION_BLOCKED",
  "AI_VIDEO_REQUEST_REJECTED",
  "AI_PROVIDER_NOT_CONFIGURED",
  "AI_SERVICE_UNAUTHORIZED",
  "AI_PROVIDER_RATE_LIMITED"
]);

function ownedVideoJob(job: MediaGenerationJob, now: Date): Prisma.MediaGenerationJobWhereInput {
  return { id: job.id, status: { in: activeJobStatuses }, attempts: job.attempts, leasedAt: job.leasedAt, leaseExpiresAt: { gt: now } };
}

async function renewVideoLease(job: MediaGenerationJob, now: Date): Promise<void> {
  const renewed = await prisma.mediaGenerationJob.updateMany({ where: ownedVideoJob(job, now), data: { leaseExpiresAt: new Date(now.getTime() + leaseMs) } });
  if (renewed.count !== 1) throw new VideoLeaseLostError("Video job ownership changed");
}

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
  const quotaDate = new Date();
  await reserveWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: quotaDate });
  try {
    return toMediaGenerationJobRecord(await dispatchGeneration(workspaceId, contentItemId, "VIDEO", input));
  } catch (error) {
    await refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: quotaDate });
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
    where: { contentItemId, workspaceId, kind: "VIDEO" },
    orderBy: { createdAt: "desc" }
  });
  return job ? toMediaGenerationJobRecord(job) : null;
}

export async function cancelMediaGenerationJob(workspaceId: string, jobId: string): Promise<MediaGenerationJobRecord> {
  const job = await prisma.mediaGenerationJob.findFirst({ where: { id: jobId, workspaceId } });
  if (!job) throw new MediaGenerationJobNotFoundError();
  if (job.kind !== "VIDEO" || ["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) throw new MediaGenerationJobStateError();

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

export async function retryMediaGenerationJob(workspaceId: string, jobId: string, expectedRevision: number): Promise<MediaGenerationJobRecord> {
  const job = await prisma.mediaGenerationJob.findFirst({ where: { id: jobId, workspaceId } });
  if (!job) throw new MediaGenerationJobNotFoundError();
  if (job.kind !== "VIDEO" || job.status !== "FAILED" || job.outputMediaAssetId)
    throw new MediaGenerationJobStateError("Only failed video requests without an output can be retried");
  // An intentional retry is a new execution of the current saved item intent.
  return queueVideoGeneration(workspaceId, job.contentItemId, {
    contentMediaItemId: job.contentMediaItemId,
    expectedRevision,
    ...(job.provider === "motion_reel" ? { motion: motionReelOptionsSchema.parse(job.renderOptions), durationSeconds: toDuration(job.durationSeconds) } : {})
  });
}

export interface VideoGenerationWorkerResult {
  completed: number;
  failed: number;
  processed: number;
  waiting: number;
}

export async function processDueVideoGenerationJobs(
  input: { limit?: number; now?: Date; shouldStop?: (() => boolean) | undefined; logger?: WorkerLogger | undefined } = {}
): Promise<VideoGenerationWorkerResult> {
  const now = input.now ?? new Date();
  const started = Date.now();
  const clock = () => new Date(now.getTime() + Date.now() - started);
  const logger = input.logger ?? workerLogger;
  const result: VideoGenerationWorkerResult = { completed: 0, failed: 0, processed: 0, waiting: 0 };
  const limit = input.limit ?? 5;

  for (let index = 0; index < limit; index += 1) {
    if (input.shouldStop?.()) break;
    const job = await claimVideoGenerationJob(clock());
    if (!job) break;
    result.processed += 1;
    const jobStarted = performance.now();
    const context = { jobId: job.id, workspaceId: job.workspaceId, attempt: job.attempts };
    logger.info("Video job claimed", { ...context, queueDelayMs: Math.max(0, clock().getTime() - job.nextAttemptAt.getTime()) });

    try {
      const outcome = await processClaimedJob(job, clock);
      result[outcome] += 1;
      logger.info("Video attempt completed", { ...context, outcome, durationMs: Math.round(performance.now() - jobStarted) });
    } catch (error) {
      logger.warn("Video attempt interrupted", {
        ...context,
        errorCode: error instanceof VideoLeaseLostError ? "VIDEO_LEASE_LOST" : workerErrorCode(error),
        durationMs: Math.round(performance.now() - jobStarted)
      });
      const outcome = await handleWorkerError(job, error, clock());
      result[outcome] += 1;
    }
  }

  return result;
}

async function claimVideoGenerationJob(now: Date): Promise<MediaGenerationJob | undefined> {
  const candidate = await prisma.mediaGenerationJob.findFirst({
    where: {
      kind: "VIDEO",
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
      attempts: candidate.attempts,
      nextAttemptAt: { lte: now },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }]
    },
    data: {
      leasedAt: now,
      leaseExpiresAt: new Date(now.getTime() + leaseMs),
      attempts: { increment: 1 }
    }
  });
  if (claimed.count !== 1) return undefined;
  return { ...candidate, leasedAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs), attempts: candidate.attempts + 1 };
}

async function processClaimedJob(job: MediaGenerationJob, clock: () => Date): Promise<"completed" | "failed" | "waiting"> {
  if (job.provider === "motion_reel") {
    const options = motionReelOptionsSchema.parse(job.renderOptions);
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: options.artworkMediaAssetId, workspaceId: job.workspaceId, deletedAt: null, mimeType: "image/jpeg" }
    });
    if (!asset || asset.sizeBytes > 8_000_000) throw new MotionArtworkError("The selected artwork is no longer available");
    const content = await prisma.contentItem.findFirst({ where: { id: job.contentItemId, workspaceId: job.workspaceId, deletedAt: null } });
    if (!content) throw new MediaContentItemNotFoundError();
    if (!["DRAFT", "IN_REVIEW"].includes(content.status)) throw new MediaContentLockedError();
    const image = await readStoredMedia(job.workspaceId, asset.s3Key);
    await renewVideoLease(job, clock());
    const processing = await prisma.mediaGenerationJob.updateMany({
      where: ownedVideoJob(job, clock()),
      data: { status: "PROCESSING", providerJobId: `motion:${job.id}`, model: "ffmpeg-motion-v1" }
    });
    if (processing.count !== 1) throw new VideoLeaseLostError("Video job ownership changed");
    const duration = toDuration(job.durationSeconds);
    const video = await renderMotionReel({ imageBase64: image.toString("base64"), textCards: options.textCards, durationSeconds: duration });
    await renewVideoLease(job, clock());
    return completeVideoJob(
      job,
      {
        provider_job_id: `motion:${job.id}`,
        status: "completed",
        progress: 100,
        model: "ffmpeg-motion-v1",
        duration_seconds: duration,
        width: 720,
        height: 1280
      },
      video,
      clock
    );
  }
  if (!job.providerJobId) {
    // STARTING is persisted before sending. A recovered claim cannot safely submit again.
    if (job.status !== "QUEUED") throw new VideoStartResultUnknownError(videoStartUnknownMessage);
    const content = await prisma.contentItem.findFirst({ where: { id: job.contentItemId, workspaceId: job.workspaceId, deletedAt: null } });
    if (!content) throw new MediaContentItemNotFoundError();
    if (!["DRAFT", "IN_REVIEW"].includes(content.status)) throw new MediaContentLockedError();
    if (content.contentType !== "REEL" && content.contentType !== "STORY") throw new MediaVideoGenerationUnsupportedError();
    const target = await prisma.contentMediaItem.findFirst({
      where: {
        id: job.contentMediaItemId,
        workspaceId: job.workspaceId,
        contentItemId: job.contentItemId,
        deletedAt: null,
        generationIntent: job.generationIntent,
        mediaKind: "VIDEO"
      }
    });
    if (!target) throw new ContentMediaValidationError("CONTENT_MEDIA_CHANGED");
    const renderPlan = await ensureRenderPlan(job, clock);
    const starting = await prisma.mediaGenerationJob.updateMany({ where: ownedVideoJob(job, clock()), data: { status: "STARTING" } });
    if (starting.count !== 1) return "waiting";
    await renewVideoLease(job, clock());
    const started = await startVideoGeneration({
      workspaceId: job.workspaceId,
      prompt: renderPlan.visual_prompt,
      durationSeconds: toDuration(job.durationSeconds)
    });
    return persistProviderState(job, started, clock);
  }

  await renewVideoLease(job, clock());
  const providerJob = await getVideoGenerationStatus(job.providerJobId);
  return persistProviderState(job, providerJob, clock);
}

async function persistProviderState(job: MediaGenerationJob, providerJob: VideoProviderJob, clock: () => Date): Promise<"completed" | "failed" | "waiting"> {
  await renewVideoLease(job, clock());
  // Save the provider identity before processing status/output so retries resume this job.
  const identified = await prisma.mediaGenerationJob.updateMany({
    where: ownedVideoJob(job, clock()),
    data: { providerJobId: providerJob.provider_job_id }
  });
  if (identified.count !== 1) throw new VideoLeaseLostError("Video job ownership changed");
  if (providerJob.status === "failed") {
    await markJobFailed(
      job,
      providerJob.error_code ?? "AI_VIDEO_GENERATION_FAILED",
      providerJob.error_message ?? "Video generation failed",
      providerJob.retryable ?? false,
      clock()
    );
    return "failed";
  }

  if (providerJob.status !== "completed") {
    await prisma.mediaGenerationJob.updateMany({
      where: ownedVideoJob(job, clock()),
      data: {
        providerJobId: providerJob.provider_job_id,
        status: "GENERATING",
        progress: providerJob.progress,
        model: providerJob.model,
        nextAttemptAt: new Date(clock().getTime() + pollDelayMs),
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
    where: ownedVideoJob(job, clock()),
    data: { status: "PROCESSING", progress: 100, providerJobId: providerJob.provider_job_id, model: providerJob.model }
  });
  if (processing.count !== 1) return "waiting";
  await renewVideoLease(job, clock());
  const renderPlan = await savedRenderPlan(job);
  const video = await downloadGeneratedVideo(providerJob.provider_job_id, renderPlan, toDuration(job.durationSeconds));
  await renewVideoLease(job, clock());
  return completeVideoJob(job, providerJob, video, clock);
}

async function completeVideoJob(job: MediaGenerationJob, providerJob: VideoProviderJob, video: Buffer, clock: () => Date): Promise<"completed" | "failed"> {
  const now = clock();
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
      if (
        !activeJobStatuses.includes(currentJob.status) ||
        currentJob.attempts !== job.attempts ||
        currentJob.leasedAt?.getTime() !== job.leasedAt?.getTime() ||
        !currentJob.leaseExpiresAt ||
        currentJob.leaseExpiresAt <= clock()
      )
        throw new VideoLeaseLostError("Video job ownership changed");
      if (currentJob.outputMediaAssetId) throw new MediaGenerationJobStateError("The generated video was already saved");
      const mediaAsset = await tx.mediaAsset.create({
        data: {
          workspaceId: job.workspaceId,
          type: job.provider === "motion_reel" ? "VIDEO" : "AI_GENERATED",
          filename: `markos-${job.provider === "motion_reel" ? "motion" : "ai"}-${job.id}.mp4`,
          s3Key: stored?.key ?? "",
          cdnUrl: stored?.publicUrl ?? "",
          mimeType: "video/mp4",
          sizeBytes: video.byteLength,
          width: providerJob.width,
          height: providerJob.height,
          durationSeconds: providerJob.duration_seconds
        }
      });
      const applied = await applyGeneratedAsset(tx, job, mediaAsset.id);
      const attachmentError = applied ? null : new ContentMediaValidationError("CONTENT_MEDIA_CHANGED", mediaAsset.id);
      await tx.aiInteraction.create({
        data: {
          workspaceId: job.workspaceId,
          agent: "VIDEO",
          promptVersion: job.provider === "motion_reel" ? "video.v1.motion" : "video.v3.configured",
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
          status: "COMPLETED",
          model: providerJob.model,
          providerJobId: providerJob.provider_job_id,
          attachmentApplied: applied,
          outputMediaAssetId: mediaAsset.id,
          completedAt: clock(),
          progress: 100,
          nextAttemptAt: now,
          leasedAt: null,
          leaseExpiresAt: null,
          errorCode: attachmentError?.code ?? null,
          errorMessage: attachmentError?.message ?? null,
          retryable: attachmentError ? false : null
        }
      });
      return "completed" as const;
    });
  } catch (error) {
    if (stored) await deleteStoredMedia(job.workspaceId, stored.key).catch(() => undefined);
    await refundWorkspaceUsage({ workspaceId: job.workspaceId, metric: "STORAGE_BYTES", amount: video.byteLength, now });
    throw error;
  }
}

async function handleWorkerError(job: MediaGenerationJob, error: unknown, now: Date): Promise<"failed" | "waiting"> {
  if (error instanceof VideoLeaseLostError) return "waiting";
  const current = await prisma.mediaGenerationJob.findFirst({ where: ownedVideoJob(job, now) });
  if (!current) return "waiting";
  if (!current.providerJobId && current.status !== "QUEUED" && !(error instanceof AiServiceRequestError && rejectedVideoStartCodes.has(error.code))) {
    await markJobFailed(job, "AI_VIDEO_START_RESULT_UNKNOWN", videoStartUnknownMessage, true, now);
    return "failed";
  }
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
    await markJobFailed(job, code, error.message, false, now);
    return "failed";
  }
  if (error instanceof MotionArtworkError || (job.provider === "motion_reel" && job.attempts >= 3)) {
    await markJobFailed(
      job,
      "MOTION_REEL_RENDER_FAILED",
      error instanceof MotionArtworkError ? error.message : "Motion rendering could not finish. Please try again.",
      false,
      now
    );
    return "failed";
  }
  if (error instanceof AiServiceRequestError && !error.retryable) {
    await markJobFailed(job, error.code, error.message, false, now);
    return "failed";
  }
  const code = error instanceof AiServiceRequestError ? error.code : "AI_VIDEO_PROCESSING_FAILED";
  const message = error instanceof Error ? error.message : "Video generation could not be completed";
  await prisma.mediaGenerationJob.updateMany({
    where: ownedVideoJob(job, now),
    data: {
      // An explicit rejection can be retried; uncertain submissions stopped above.
      ...(!current.providerJobId ? { status: "QUEUED" as const } : {}),
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

async function markJobFailed(job: MediaGenerationJob, code: string, message: string, retryable: boolean, now: Date): Promise<void> {
  const updated = await prisma.mediaGenerationJob.updateMany({
    where: ownedVideoJob(job, now),
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

function toDuration(value: number | null): 4 | 8 | 12 {
  return value === 4 || value === 12 ? value : 8;
}

export function toMediaGenerationJobRecord(job: MediaGenerationJob): MediaGenerationJobRecord {
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    contentItemId: job.contentItemId,
    contentMediaItemId: job.contentMediaItemId,
    requestedRevision: job.requestedRevision,
    ...(job.attachmentApplied === null ? {} : { attachmentApplied: job.attachmentApplied }),
    kind: job.kind,
    status: job.status,
    prompt: job.prompt,
    aspectRatio: job.aspectRatio as "1:1" | "4:5" | "9:16",
    ...(job.durationSeconds === null ? {} : { durationSeconds: toDuration(job.durationSeconds) }),
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
