import type { PublishJob } from "@prisma/client";
import type { PublishJobRecord } from "@markos/shared-types";
import { prisma } from "../db/prisma";
import { publishContentItem, PublishContentItemNotFoundError, type PublishAttemptRecord } from "./publishing-service";
import { InstagramPublishError, type InstagramPublisher } from "./instagram-publisher";
import { env } from "../config/env";
import { lockContentForMedia } from "../media/content-media-integrity";
import { workerErrorCode, workerLogger, type WorkerLogger } from "../worker/worker-diagnostics";

const leaseMs = Math.max(5 * 60_000, env.INSTAGRAM_CONTAINER_POLL_DELAY_MS + 60_000, env.INSTAGRAM_GRAPH_REQUEST_TIMEOUT_MS + 60_000);

export class PublishNowStateError extends Error {
  constructor(message = "Only ready, scheduled, or failed content can be published now") {
    super(message);
  }
}

export async function queuePublishNow(workspaceId: string, contentItemId: string, now = new Date()): Promise<PublishJobRecord> {
  try {
    const job = await prisma.$transaction(async (tx) => {
      const content = await lockContentForMedia(tx, workspaceId, contentItemId);
      if (!content) throw new PublishContentItemNotFoundError();
      if (!["APPROVED", "SCHEDULED", "FAILED"].includes(content.status)) throw new PublishNowStateError();
      const active = await tx.publishJob.findFirst({
        where: { contentItemId, workspaceId, status: { in: ["QUEUED", "PROCESSING", "RETRY_WAIT"] } },
        orderBy: { createdAt: "desc" }
      });
      if (active) return active;
      await tx.contentItem.update({
        where: { id: content.id },
        data: { status: "SCHEDULED", scheduledAt: now, failureReason: null }
      });
      return tx.publishJob.create({
        data: {
          workspaceId,
          contentItemId,
          trigger: "PUBLISH_NOW",
          scheduledFor: now,
          nextAttemptAt: now,
          idempotencyKey: `publish-now:${contentItemId}:${now.toISOString()}:${content.revision}`
        }
      });
    });
    return toPublishJobRecord(job);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const raced = await prisma.publishJob.findFirst({
        where: { contentItemId, workspaceId, status: { in: ["QUEUED", "PROCESSING", "RETRY_WAIT"] } },
        orderBy: { createdAt: "desc" }
      });
      if (raced) return toPublishJobRecord(raced);
    }
    throw error;
  }
}

export async function getLatestPublishJob(workspaceId: string, contentItemId: string): Promise<PublishJobRecord | null> {
  const job = await prisma.publishJob.findFirst({ where: { workspaceId, contentItemId }, orderBy: { createdAt: "desc" } });
  return job ? toPublishJobRecord(job) : null;
}

export interface PublishJobWorkerResult {
  attempted: number;
  completed: number;
  failed: number;
  processed: number;
  retrying: number;
}

export async function processDuePublishJobs(
  input: { limit?: number; now?: Date; publisher?: InstagramPublisher; shouldStop?: (() => boolean) | undefined; logger?: WorkerLogger | undefined } = {}
): Promise<PublishJobWorkerResult> {
  const now = input.now ?? new Date();
  const startedAt = Date.now();
  const clock = () => new Date(now.getTime() + Date.now() - startedAt);
  await ensureDueScheduledPublishJobs(now);
  const result: PublishJobWorkerResult = { attempted: 0, completed: 0, failed: 0, processed: 0, retrying: 0 };

  for (let index = 0; index < (input.limit ?? 10); index += 1) {
    if (input.shouldStop?.()) break;
    const claimed = await claimPublishJob(clock());
    if (!claimed) break;
    const { job, interrupted } = claimed;
    const jobStarted = performance.now();
    const logger = input.logger ?? workerLogger;
    const context = { jobId: job.id, workspaceId: job.workspaceId, contentItemId: job.contentItemId, attempt: job.attempts };
    logger.info("Publish job claimed", {
      ...context,
      queueDelayMs: Math.max(0, clock().getTime() - job.nextAttemptAt.getTime()),
      scheduleDelayMs: Math.max(0, clock().getTime() - job.scheduledFor.getTime()),
      interrupted
    });
    result.processed += 1;
    if (!interrupted) result.attempted += 1;
    const attempt = await prisma.publishAttempt.create({
      data: {
        workspaceId: job.workspaceId,
        publishJobId: job.id,
        contentItemId: job.contentItemId,
        attemptNumber: job.attempts,
        status: "PROCESSING",
        startedAt: clock()
      }
    });

    let outcome: PublishAttemptRecord;
    try {
      const content = await prisma.contentItem.findUnique({ where: { id: job.contentItemId }, select: { status: true, instagramPostId: true } });
      if (content?.status === "PUBLISHED" && content.instagramPostId) {
        outcome = { contentItemId: job.contentItemId, dryRun: false, reasons: [], status: "PUBLISHED" };
      } else if (interrupted) {
        // A crashed worker may have published before saving the result. Never
        // create a fresh container automatically from an abandoned attempt.
        outcome = { contentItemId: job.contentItemId, dryRun: false, reasons: ["INSTAGRAM_PUBLISH_RESULT_UNKNOWN"], status: "FAILED" };
      } else {
        outcome = await publishContentItem(job.workspaceId, job.contentItemId, {
          now: clock(),
          beforeRequest: async () => {
            const current = clock();
            const renewed = await prisma.publishJob.updateMany({
              where: { id: job.id, status: "PROCESSING", attempts: job.attempts, leaseExpiresAt: { gt: current } },
              data: { leaseExpiresAt: new Date(current.getTime() + leaseMs) }
            });
            if (renewed.count !== 1) throw new InstagramPublishError("INSTAGRAM_PUBLISH_LEASE_LOST");
          },
          ...(input.publisher === undefined ? {} : { publisher: input.publisher })
        });
      }
    } catch (error) {
      logger.error("Publish job failed unexpectedly", { ...context, errorCode: workerErrorCode(error) });
      outcome = {
        contentItemId: job.contentItemId,
        dryRun: false,
        reasons: ["PUBLISH_WORKER_UNEXPECTED_ERROR"],
        status: "FAILED",
        retryable: false
      };
    }

    // A worker that lost its lease must not finalize another worker's claim.
    const owned = await prisma.publishJob.findFirst({ where: { id: job.id, status: "PROCESSING", attempts: job.attempts }, select: { id: true } });
    if (!owned) continue;
    const completedAt = clock();
    logger.info("Publish attempt completed", {
      ...context,
      outcome: outcome.status,
      errorCode: outcome.reasons[0],
      durationMs: Math.round(performance.now() - jobStarted)
    });
    if (outcome.status === "PUBLISHED") {
      await finishPublishAttempt(job, attempt.id, "PUBLISHED", completedAt);
      result.completed += 1;
    } else if (outcome.status === "DRY_RUN") {
      await prisma.$transaction([
        prisma.publishAttempt.update({ where: { id: attempt.id }, data: { status: "DRY_RUN", completedAt } }),
        prisma.publishJob.update({
          where: { id: job.id, status: "PROCESSING", attempts: job.attempts },
          data: { status: "CANCELLED", leasedAt: null, leaseExpiresAt: null }
        })
      ]);
      result.completed += 1;
    } else if (outcome.retryable && job.attempts < job.maxAttempts) {
      const nextAttemptAt = new Date(completedAt.getTime() + retryDelay(job.attempts));
      const errorCode = outcome.reasons[0] ?? "INSTAGRAM_PUBLISH_RETRY_REQUIRED";
      await prisma.$transaction([
        prisma.publishAttempt.update({
          where: { id: attempt.id },
          data: { status: outcome.status, errorCode, retryable: true, completedAt }
        }),
        prisma.publishJob.update({
          where: { id: job.id, status: "PROCESSING", attempts: job.attempts },
          data: {
            status: "RETRY_WAIT",
            nextAttemptAt,
            leasedAt: null,
            leaseExpiresAt: null,
            lastErrorCode: errorCode,
            lastErrorMessage: safePublishMessage(errorCode)
          }
        })
      ]);
      result.retrying += 1;
    } else {
      await failPublishJob(job, attempt.id, outcome, completedAt);
      result.failed += 1;
    }
  }

  return result;
}

async function ensureDueScheduledPublishJobs(now: Date): Promise<void> {
  const contentItems = await prisma.contentItem.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now }, deletedAt: null },
    select: { id: true, workspaceId: true },
    take: 100
  });
  for (const candidate of contentItems) {
    await prisma.$transaction(async (tx) => {
      const content = await lockContentForMedia(tx, candidate.workspaceId, candidate.id);
      if (!content || content.status !== "SCHEDULED" || !content.scheduledAt || content.scheduledAt > now) return;
      // Re-read after locking: a scan must never recreate a job cancelled by a concurrent edit.
      const active = await tx.publishJob.findFirst({
        where: { contentItemId: content.id, status: { in: ["QUEUED", "RETRY_WAIT", "PROCESSING"] } },
        select: { id: true }
      });
      if (active) return;
      await tx.publishJob.createMany({
        data: [
          {
            workspaceId: content.workspaceId,
            contentItemId: content.id,
            trigger: "SCHEDULED",
            scheduledFor: content.scheduledAt,
            nextAttemptAt: now,
            // A deliberate reschedule can reuse a previous time; revisions distinguish those schedules.
            idempotencyKey: `scheduled:${content.id}:${content.scheduledAt.toISOString()}:${content.revision}`
          }
        ],
        skipDuplicates: true
      });
    });
  }
}

async function claimPublishJob(now: Date): Promise<{ job: PublishJob; interrupted: boolean } | undefined> {
  const candidate = await prisma.publishJob.findFirst({
    where: {
      status: { in: ["QUEUED", "RETRY_WAIT", "PROCESSING"] },
      nextAttemptAt: { lte: now },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }]
    },
    orderBy: { nextAttemptAt: "asc" }
  });
  if (!candidate) return undefined;
  return prisma.$transaction(async (tx) => {
    const content = await lockContentForMedia(tx, candidate.workspaceId, candidate.contentItemId);
    if (
      candidate.status !== "PROCESSING" &&
      (!content || content.status !== "SCHEDULED" || content.scheduledAt?.getTime() !== candidate.scheduledFor.getTime())
    ) {
      await tx.publishJob.updateMany({
        where: { id: candidate.id, status: { in: ["QUEUED", "RETRY_WAIT"] } },
        data: { status: "CANCELLED", leasedAt: null, leaseExpiresAt: null }
      });
      return undefined;
    }
    if (candidate.status !== "PROCESSING" && content?.scheduledAt && content.scheduledAt > now) return undefined;
    const claimed = await tx.publishJob.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
        attempts: candidate.attempts,
        nextAttemptAt: { lte: now },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }]
      },
      data: { status: "PROCESSING", leasedAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs), attempts: { increment: 1 } }
    });
    if (claimed.count !== 1) return undefined;
    return { job: await tx.publishJob.findUniqueOrThrow({ where: { id: candidate.id } }), interrupted: candidate.status === "PROCESSING" };
  });
}

async function finishPublishAttempt(job: PublishJob, attemptId: string, status: string, now: Date): Promise<void> {
  await prisma.$transaction([
    prisma.publishAttempt.update({ where: { id: attemptId }, data: { status, completedAt: now } }),
    prisma.publishJob.update({
      where: { id: job.id, status: "PROCESSING", attempts: job.attempts },
      data: { status: "PUBLISHED", publishedAt: now, leasedAt: null, leaseExpiresAt: null, lastErrorCode: null, lastErrorMessage: null }
    })
  ]);
}

async function failPublishJob(job: PublishJob, attemptId: string, outcome: PublishAttemptRecord, now: Date): Promise<void> {
  const errorCode = outcome.reasons[0] ?? "INSTAGRAM_PUBLISH_FAILED";
  const owner = await prisma.workspace.findFirst({ where: { id: job.workspaceId }, select: { ownerUserId: true } });
  await prisma.$transaction(async (tx) => {
    await tx.publishAttempt.update({
      where: { id: attemptId },
      data: { status: outcome.status, errorCode, retryable: outcome.retryable ?? false, completedAt: now }
    });
    await tx.publishJob.update({
      where: { id: job.id, status: "PROCESSING", attempts: job.attempts },
      data: {
        status: "FAILED",
        leasedAt: null,
        leaseExpiresAt: null,
        lastErrorCode: errorCode,
        lastErrorMessage: safePublishMessage(errorCode)
      }
    });
    await tx.contentItem.updateMany({
      where: { id: job.contentItemId, workspaceId: job.workspaceId, status: { not: "PUBLISHED" } },
      data: { status: "FAILED", failureReason: errorCode }
    });
    if (owner) {
      await tx.notification.create({
        data: {
          userId: owner.ownerUserId,
          workspaceId: job.workspaceId,
          channel: "IN_APP",
          templateKey: "publishing_failed",
          payload: {
            contentItemId: job.contentItemId,
            publishJobId: job.id,
            errorCode,
            message: safePublishMessage(errorCode),
            occurredAt: now.toISOString()
          }
        }
      });
    }
  });
}

function retryDelay(attempt: number): number {
  return Math.min(15 * 60_000, 2 * 60_000 * 2 ** Math.max(0, attempt - 1));
}

function safePublishMessage(code: string | undefined): string {
  if (!code) return "MARKOS could not publish this content. Review it and try again.";
  if (code === "INSTAGRAM_PUBLISH_RESULT_UNKNOWN" || code === "INSTAGRAM_PUBLISH_LEASE_LOST" || code === "PUBLISH_WORKER_UNEXPECTED_ERROR")
    return "Publishing was interrupted or its result could not be confirmed. Check the Instagram account before retrying to avoid a duplicate post.";
  if (code === "INSTAGRAM_DAILY_PUBLISHING_LIMIT_REACHED") return "Instagram's publishing limit was reached. Choose a later time.";
  if (code.includes("TOKEN") || code.includes("RECONNECT") || code === "INSTAGRAM_NOT_CONNECTED") return "Reconnect Instagram before publishing this content.";
  if (code.includes("MEDIA")) return "Review the attached media before trying to publish again.";
  return "MARKOS could not publish this content. Review it and try again.";
}

export function toPublishJobRecord(job: PublishJob): PublishJobRecord {
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    contentItemId: job.contentItemId,
    status: job.status,
    trigger: job.trigger,
    scheduledFor: job.scheduledFor.toISOString(),
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    nextAttemptAt: job.nextAttemptAt.toISOString(),
    ...(job.lastErrorCode ? { lastErrorCode: job.lastErrorCode } : {}),
    ...(job.lastErrorMessage ? { lastErrorMessage: job.lastErrorMessage } : {}),
    ...(job.publishedAt ? { publishedAt: job.publishedAt.toISOString() } : {}),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString()
  };
}

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}
