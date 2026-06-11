import type { ContentStatus, ContentType, Prisma } from "@prisma/client";
import type { ContentRecord, StrategyPlan } from "@markos/shared-types";
import type { GenerateContentInput, ScheduleContentInput, UpdateContentInput, UpdateContentStatusInput } from "@markos/validation";
import { generateContentDrafts } from "../ai/content-client";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { refundWorkspaceUsage, reserveWorkspaceUsage } from "../usage/usage-service";
import { getVaultScore, searchVaultContext } from "../vault/vault-service";

const contentAgentName = "CONTENT";
const localCurrency = "BHD";

export class ContentContextMissingError extends Error {
  constructor() {
    super("Complete at least one Vault section before generating content");
  }
}

export class ContentItemNotFoundError extends Error {
  constructor() {
    super("Content item was not found");
  }
}

export class ContentItemLockedError extends Error {
  constructor() {
    super("Content item cannot be edited in its current status");
  }
}

export class ContentStatusTransitionError extends Error {
  constructor() {
    super("Content item cannot move to that status from its current status");
  }
}

export class ContentScheduleError extends Error {
  constructor(message = "Content item cannot be scheduled in its current state") {
    super(message);
  }
}

export async function listContentItems(workspaceId: string): Promise<ContentRecord[]> {
  const rows = await prisma.contentItem.findMany({
    where: {
      workspaceId,
      deletedAt: null
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 50
  });

  return rows.map(toContentRecord);
}

export async function generateWorkspaceContent(
  workspaceId: string,
  input: GenerateContentInput
): Promise<ContentRecord[]> {
  const score = await getVaultScore(workspaceId);

  if (score.entryCount === 0) {
    throw new ContentContextMissingError();
  }

  const strategy = await findStrategy(workspaceId, input.strategyId);
  const context = await searchVaultContext(workspaceId, {
    query: input.topic,
    topK: 8
  });
  const generationCount = input.count;
  const usagePeriodDate = new Date();
  await reserveWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", amount: generationCount, now: usagePeriodDate });

  try {
    const generated = await generateContentDrafts({
      workspaceId,
      topic: input.topic,
      contentType: input.contentType,
      count: input.count,
      context,
      ...(strategy === undefined ? {} : { strategy })
    });

    const saved = await prisma.$transaction(async (tx) => {
      const rows = [];

      for (const draft of generated.drafts) {
        rows.push(
          await tx.contentItem.create({
            data: {
              workspaceId,
              contentType: draft.contentType,
              status: "DRAFT",
              ...(draft.captionEn === undefined ? {} : { captionEn: draft.captionEn }),
              ...(draft.captionAr === undefined ? {} : { captionAr: draft.captionAr }),
              hashtags: draft.hashtags,
              ...(draft.callToAction === undefined ? {} : { callToAction: draft.callToAction }),
              mediaIds: [],
              ...(draft.carousel === undefined ? {} : { carousel: draft.carousel as unknown as Prisma.InputJsonValue }),
              ...(draft.reelScript === undefined ? {} : { reelScript: draft.reelScript as unknown as Prisma.InputJsonValue }),
              ...(draft.contentPillar === undefined ? {} : { contentPillar: draft.contentPillar }),
              aiPromptUsed: generated.prompt_version
            }
          })
        );
      }

      await tx.aiInteraction.create({
        data: {
          workspaceId,
          agent: contentAgentName,
          promptVersion: generated.prompt_version,
          prompt: {
            topic: input.topic,
            contentType: input.contentType,
            count: input.count,
            ...(input.strategyId === undefined ? {} : { strategyId: input.strategyId }),
            retrievedContext: context
          } as unknown as Prisma.InputJsonValue,
          response: {
            drafts: generated.drafts
          } as unknown as Prisma.InputJsonValue,
          tokensIn: generated.tokens_in,
          tokensOut: generated.tokens_out,
          costMinor: 0,
          currency: localCurrency,
          model: generated.model || env.LLM_PRIMARY_MODEL
        }
      });

      return rows;
    });

    return saved.map(toContentRecord);
  } catch (error) {
    await refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", amount: generationCount, now: usagePeriodDate });
    throw error;
  }
}

export async function updateContentItem(
  workspaceId: string,
  contentItemId: string,
  input: UpdateContentInput
): Promise<ContentRecord> {
  const current = await prisma.contentItem.findFirst({
    where: {
      id: contentItemId,
      workspaceId,
      deletedAt: null
    }
  });

  if (!current) {
    throw new ContentItemNotFoundError();
  }

  if (!["DRAFT", "IN_REVIEW"].includes(current.status)) {
    throw new ContentItemLockedError();
  }

  const row = await prisma.contentItem.update({
    where: {
      id: current.id
    },
    data: {
      ...(input.captionEn === undefined ? {} : { captionEn: input.captionEn }),
      ...(input.captionAr === undefined ? {} : { captionAr: input.captionAr }),
      ...(input.hashtags === undefined ? {} : { hashtags: input.hashtags }),
      ...(input.callToAction === undefined ? {} : { callToAction: input.callToAction }),
      ...(input.contentPillar === undefined ? {} : { contentPillar: input.contentPillar }),
      ...(input.carousel === undefined ? {} : { carousel: input.carousel as unknown as Prisma.InputJsonValue }),
      ...(input.reelScript === undefined ? {} : { reelScript: input.reelScript as unknown as Prisma.InputJsonValue })
    }
  });

  return toContentRecord(row);
}

export async function updateContentItemStatus(
  workspaceId: string,
  contentItemId: string,
  input: UpdateContentStatusInput
): Promise<ContentRecord> {
  const current = await prisma.contentItem.findFirst({
    where: {
      id: contentItemId,
      workspaceId,
      deletedAt: null
    }
  });

  if (!current) {
    throw new ContentItemNotFoundError();
  }

  if (!isAllowedContentTransition(current.status, input.status)) {
    throw new ContentStatusTransitionError();
  }

  const row = await prisma.contentItem.update({
    where: {
      id: current.id
    },
    data: {
      status: input.status
    }
  });

  return toContentRecord(row);
}

export async function scheduleContentItem(
  workspaceId: string,
  contentItemId: string,
  input: ScheduleContentInput
): Promise<ContentRecord> {
  const current = await prisma.contentItem.findFirst({
    where: {
      id: contentItemId,
      workspaceId,
      deletedAt: null
    }
  });

  if (!current) {
    throw new ContentItemNotFoundError();
  }

  if (current.status !== "APPROVED") {
    throw new ContentScheduleError();
  }

  const scheduledAt = new Date(input.scheduledAt);

  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
    throw new ContentScheduleError("Schedule time must be in the future");
  }

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.contentItem.update({
      where: {
        id: current.id
      },
      data: {
        scheduledAt,
        status: "SCHEDULED"
      }
    });

    await addToContentCalendar(tx, workspaceId, updated.id, scheduledAt);

    return updated;
  });

  return toContentRecord(row);
}

export async function unscheduleContentItem(workspaceId: string, contentItemId: string): Promise<ContentRecord> {
  const current = await prisma.contentItem.findFirst({
    where: {
      id: contentItemId,
      workspaceId,
      deletedAt: null
    }
  });

  if (!current) {
    throw new ContentItemNotFoundError();
  }

  if (current.status !== "SCHEDULED") {
    throw new ContentScheduleError("Only scheduled content can be unscheduled");
  }

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.contentItem.update({
      where: {
        id: current.id
      },
      data: {
        scheduledAt: null,
        status: "APPROVED"
      }
    });

    if (current.scheduledAt) {
      await removeFromContentCalendar(tx, workspaceId, current.id, current.scheduledAt);
    }

    return updated;
  });

  return toContentRecord(row);
}

async function addToContentCalendar(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  contentItemId: string,
  scheduledAt: Date
): Promise<void> {
  const month = monthStart(scheduledAt);
  const current = await tx.contentCalendar.findFirst({
    where: {
      workspaceId,
      month,
      deletedAt: null
    }
  });
  const plan = mergeCalendarPlan(current?.plan, contentItemId);

  if (current) {
    await tx.contentCalendar.update({
      where: {
        id: current.id
      },
      data: {
        plan: plan as unknown as Prisma.InputJsonValue
      }
    });
    return;
  }

  await tx.contentCalendar.create({
    data: {
      workspaceId,
      month,
      plan: plan as unknown as Prisma.InputJsonValue
    }
  });
}

async function removeFromContentCalendar(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  contentItemId: string,
  scheduledAt: Date
): Promise<void> {
  const current = await tx.contentCalendar.findFirst({
    where: {
      workspaceId,
      month: monthStart(scheduledAt),
      deletedAt: null
    }
  });

  if (!current) {
    return;
  }

  const plan = mergeCalendarPlan(current.plan, contentItemId, "remove");

  await tx.contentCalendar.update({
    where: {
      id: current.id
    },
    data: {
      plan: plan as unknown as Prisma.InputJsonValue
    }
  });
}

function mergeCalendarPlan(
  value: Prisma.JsonValue | undefined,
  contentItemId: string,
  mode: "add" | "remove" = "add"
): { scheduledContentIds: string[] } {
  const current =
    typeof value === "object" && value !== null && !Array.isArray(value) && Array.isArray(value.scheduledContentIds)
      ? value.scheduledContentIds.filter((id): id is string => typeof id === "string")
      : [];
  const ids = mode === "add" ? Array.from(new Set([...current, contentItemId])) : current.filter((id) => id !== contentItemId);

  return {
    scheduledContentIds: ids
  };
}

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function isAllowedContentTransition(current: ContentStatus, next: UpdateContentStatusInput["status"]): boolean {
  if (current === next) {
    return true;
  }

  const allowed: Record<UpdateContentStatusInput["status"], UpdateContentStatusInput["status"][]> = {
    APPROVED: ["DRAFT"],
    DRAFT: ["IN_REVIEW"],
    IN_REVIEW: ["APPROVED", "DRAFT"]
  };

  return allowed[current as UpdateContentStatusInput["status"]]?.includes(next) ?? false;
}

async function findStrategy(workspaceId: string, strategyId: string | undefined): Promise<StrategyPlan | undefined> {
  const row = await prisma.strategy.findFirst({
    where: {
      workspaceId,
      deletedAt: null,
      ...(strategyId === undefined ? {} : { id: strategyId })
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (!row) {
    return undefined;
  }

  return row.content as unknown as StrategyPlan;
}

export function toContentRecord(row: {
  id: string;
  workspaceId: string;
  contentType: ContentType;
  status: ContentStatus;
  captionEn: string | null;
  captionAr: string | null;
  hashtags: string[];
  callToAction: string | null;
  mediaIds: string[];
  carousel: Prisma.JsonValue | null;
  reelScript: Prisma.JsonValue | null;
  contentPillar: string | null;
  campaignId: string | null;
  aiPromptUsed: string | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  instagramPostId: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ContentRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    contentType: row.contentType,
    status: row.status,
    ...(row.captionEn === null ? {} : { captionEn: row.captionEn }),
    ...(row.captionAr === null ? {} : { captionAr: row.captionAr }),
    hashtags: row.hashtags,
    ...(row.callToAction === null ? {} : { callToAction: row.callToAction }),
    mediaIds: row.mediaIds,
    ...(row.carousel === null ? {} : { carousel: row.carousel as Record<string, unknown> }),
    ...(row.reelScript === null ? {} : { reelScript: row.reelScript as Record<string, unknown> }),
    ...(row.contentPillar === null ? {} : { contentPillar: row.contentPillar }),
    ...(row.campaignId === null ? {} : { campaignId: row.campaignId }),
    ...(row.aiPromptUsed === null ? {} : { aiPromptUsed: row.aiPromptUsed }),
    ...(row.scheduledAt === null ? {} : { scheduledAt: row.scheduledAt.toISOString() }),
    ...(row.publishedAt === null ? {} : { publishedAt: row.publishedAt.toISOString() }),
    ...(row.instagramPostId === null ? {} : { instagramPostId: row.instagramPostId }),
    ...(row.failureReason === null ? {} : { failureReason: row.failureReason }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
