import type { PublishJob } from "@prisma/client";
import type { PublishJobRecord } from "@markos/shared-types";
import { prisma } from "../db/prisma";
import { publishContentItem, PublishContentItemNotFoundError, type PublishAttemptRecord } from "./publishing-service";
import type { InstagramPublisher } from "./instagram-publisher";

const leaseMs = 5 * 60_000;

export class PublishNowStateError extends Error {
  constructor(message = "Only ready, scheduled, or failed content can be published now") {
    super(message);
  }
}

export async function queuePublishNow(workspaceId: string, contentItemId: string, now = new Date()): Promise<PublishJobRecord> {
  const content = await prisma.contentItem.findFirst({ where: { id: contentItemId, workspaceId, deletedAt: null } });
  if (!content) throw new PublishContentItemNotFoundError();
  if (!["APPROVED", "SCHEDULED", "FAILED"].includes(content.status)) throw new PublishNowStateError();

  const active = await prisma.publishJob.findFirst({
    where: { contentItemId, workspaceId, status: { in: ["QUEUED", "PROCESSING", "RETRY_WAIT"] } },
    orderBy: { createdAt: "desc" }
  });
  if (active) return toPublishJobRecord(active);

  try {
    const job = await prisma.$transaction(async (tx) => {
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
          idempotencyKey: `publish-now:${contentItemId}:${now.toISOString()}`
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

export async function processDuePublishJobs(input: { limit?: number; now?: Date; publisher?: InstagramPublisher } = {}): Promise<PublishJobWorkerResult> {
  const now = input.now ?? new Date();
  await ensureDueScheduledPublishJobs(now);
  const result: PublishJobWorkerResult = { attempted: 0, completed: 0, failed: 0, processed: 0, retrying: 0 };

  for (let index = 0; index < (input.limit ?? 10); index += 1) {
    const job = await claimPublishJob(now);
    if (!job) break;
    result.processed += 1;
    result.attempted += 1;
    const attempt = await prisma.publishAttempt.create({
      data: {
        workspaceId: job.workspaceId,
        publishJobId: job.id,
        contentItemId: job.contentItemId,
        attemptNumber: job.attempts,
        status: "PROCESSING",
        startedAt: now
      }
    });

    let outcome: PublishAttemptRecord;
    try {
      outcome = await publishContentItem(job.workspaceId, job.contentItemId, {
        now,
        ...(input.publisher === undefined ? {} : { publisher: input.publisher })
      });
    } catch (error) {
      outcome = {
        contentItemId: job.contentItemId,
        dryRun: false,
        reasons: ["PUBLISH_WORKER_UNEXPECTED_ERROR"],
        status: "FAILED",
        retryable: true
      };
    }

    if (outcome.status === "PUBLISHED") {
      await finishPublishAttempt(job, attempt.id, "PUBLISHED", now);
      result.completed += 1;
    } else if (outcome.status === "DRY_RUN") {
      await prisma.$transaction([
        prisma.publishAttempt.update({ where: { id: attempt.id }, data: { status: "DRY_RUN", completedAt: now } }),
        prisma.publishJob.update({ where: { id: job.id }, data: { status: "CANCELLED", leasedAt: null, leaseExpiresAt: null } })
      ]);
      result.completed += 1;
    } else if (outcome.retryable && job.attempts < job.maxAttempts) {
      const nextAttemptAt = new Date(now.getTime() + retryDelay(job.attempts));
      const errorCode = outcome.reasons[0] ?? "INSTAGRAM_PUBLISH_RETRY_REQUIRED";
      await prisma.$transaction([
        prisma.publishAttempt.update({
          where: { id: attempt.id },
          data: { status: outcome.status, errorCode, retryable: true, completedAt: now }
        }),
        prisma.publishJob.update({
          where: { id: job.id },
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
      await failPublishJob(job, attempt.id, outcome, now);
      result.failed += 1;
    }
  }

  return result;
}

async function ensureDueScheduledPublishJobs(now: Date): Promise<void> {
  const contentItems = await prisma.contentItem.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now }, deletedAt: null },
    select: { id: true, workspaceId: true, scheduledAt: true },
    take: 100
  });
  if (contentItems.length === 0) return;
  await prisma.publishJob.createMany({
    data: contentItems.flatMap((content) =>
      content.scheduledAt
        ? [
            {
              workspaceId: content.workspaceId,
              contentItemId: content.id,
              trigger: "SCHEDULED" as const,
              scheduledFor: content.scheduledAt,
              nextAttemptAt: now,
              idempotencyKey: `scheduled:${content.id}:${content.scheduledAt.toISOString()}`
            }
          ]
        : []
    ),
    skipDuplicates: true
  });
}

async function claimPublishJob(now: Date): Promise<PublishJob | undefined> {
  const candidate = await prisma.publishJob.findFirst({
    where: {
      status: { in: ["QUEUED", "RETRY_WAIT", "PROCESSING"] },
      nextAttemptAt: { lte: now },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }]
    },
    orderBy: { nextAttemptAt: "asc" }
  });
  if (!candidate) return undefined;
  const claimed = await prisma.publishJob.updateMany({
    where: { id: candidate.id, status: candidate.status, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }] },
    data: { status: "PROCESSING", leasedAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs), attempts: { increment: 1 } }
  });
  if (claimed.count !== 1) return undefined;
  return prisma.publishJob.findUniqueOrThrow({ where: { id: candidate.id } });
}

async function finishPublishAttempt(job: PublishJob, attemptId: string, status: string, now: Date): Promise<void> {
  await prisma.$transaction([
    prisma.publishAttempt.update({ where: { id: attemptId }, data: { status, completedAt: now } }),
    prisma.publishJob.update({
      where: { id: job.id },
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
      where: { id: job.id },
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
