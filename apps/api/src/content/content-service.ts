import type { ContentStatus, ContentType, Prisma } from "@prisma/client";
import type { CampaignPlan, ContentRecord, ContentToneLock, VaultRagChunk } from "@markos/shared-types";
import type {
  CreateContentInput,
  GenerateContentForSlotInput,
  GenerateContentInput,
  ScheduleContentInput,
  UpdateContentInput,
  UpdateContentStatusInput
} from "@markos/validation";
import { generateContentDrafts } from "../ai/content-client";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { selectPromptTemplateForRun } from "../prompts/prompt-service";
import { recordAiTokenUsage, refundWorkspaceUsage, reserveWorkspaceUsage } from "../usage/usage-service";
import { getVaultScore, listVaultSection, searchVaultContext } from "../vault/vault-service";

const contentAgentName = "CONTENT";
const localCurrency = "BHD";

export class ContentContextMissingError extends Error {
  constructor() {
    super("Complete at least one Vault section before generating content");
  }
}

export class ContentCampaignNotFoundError extends Error {
  constructor() {
    super("Campaign was not found");
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

export class ContentItemDeleteError extends Error {
  constructor(
    message: string,
    readonly code: "CONTENT_DELETE_FORBIDDEN" | "CONTENT_DELETE_REQUIRES_CANCELLATION"
  ) {
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

export async function createWorkspaceContent(workspaceId: string, input: CreateContentInput): Promise<ContentRecord> {
  const row = await prisma.contentItem.create({
    data: {
      workspaceId,
      contentType: input.contentType,
      status: "DRAFT",
      ...(input.captionEn === undefined ? {} : { captionEn: input.captionEn }),
      ...(input.captionAr === undefined ? {} : { captionAr: input.captionAr }),
      hashtags: input.hashtags ?? [],
      ...(input.callToAction === undefined ? {} : { callToAction: input.callToAction }),
      ...(input.contentPillar === undefined ? {} : { contentPillar: input.contentPillar }),
      ...(input.carousel == null ? {} : { carousel: input.carousel as Prisma.InputJsonValue }),
      ...(input.reelScript == null ? {} : { reelScript: input.reelScript as Prisma.InputJsonValue }),
      ...(input.plannedAt == null ? {} : { plannedAt: new Date(input.plannedAt) }),
      mediaIds: []
    }
  });

  return toContentRecord(row);
}

export async function generateWorkspaceContent(workspaceId: string, input: GenerateContentInput): Promise<ContentRecord[]> {
  const score = await getVaultScore(workspaceId);

  if (score.entryCount === 0) {
    throw new ContentContextMissingError();
  }

  const campaign = await findCampaign(workspaceId, input.campaignId);
  const context = await searchVaultContext(workspaceId, {
    query: input.topic,
    topK: 8
  });
  const toneLock = await getContentToneLock(workspaceId);
  const lockedContext = mergeVaultContext(context, toneLock.context);
  const promptTemplate = await selectPromptTemplateForRun(
    workspaceId,
    contentAgentName,
    `${workspaceId}:${input.topic}:${input.contentType}:${input.count}:${input.campaignId ?? "orphan"}`
  );
  const generationCount = input.count;
  const usagePeriodDate = new Date();
  await reserveWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", amount: generationCount, now: usagePeriodDate });

  try {
    const generated = await generateContentDrafts({
      workspaceId,
      topic: input.topic,
      contentType: input.contentType,
      count: input.count,
      context: lockedContext,
      toneLock: toneLock.lock,
      ...(promptTemplate === undefined ? {} : { promptTemplate: { body: promptTemplate.body, version: promptTemplate.version } }),
      ...(campaign === undefined ? {} : { campaign })
    });
    const promptVersion = promptTemplate?.version ?? generated.prompt_version;

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
              ...(input.campaignId === undefined ? {} : { campaignId: input.campaignId }),
              aiPromptUsed: promptVersion
            }
          })
        );
      }

      await tx.aiInteraction.create({
        data: {
          workspaceId,
          agent: contentAgentName,
          promptVersion,
          prompt: {
            topic: input.topic,
            contentType: input.contentType,
            count: input.count,
            ...(input.campaignId === undefined ? {} : { campaignId: input.campaignId }),
            ...(promptTemplate === undefined ? {} : { promptTemplate }),
            toneLock: toneLock.lock,
            retrievedContext: lockedContext
          } as unknown as Prisma.InputJsonValue,
          response: {
            drafts: generated.drafts,
            providerPromptVersion: generated.prompt_version
          } as unknown as Prisma.InputJsonValue,
          tokensIn: generated.tokens_in,
          tokensOut: generated.tokens_out,
          costMinor: 0,
          currency: localCurrency,
          model: generated.model || env.LLM_PRIMARY_MODEL
        }
      });
      await recordAiTokenUsage({
        client: tx,
        workspaceId,
        tokensIn: generated.tokens_in,
        tokensOut: generated.tokens_out,
        now: usagePeriodDate
      });

      return rows;
    });

    return saved.map(toContentRecord);
  } catch (error) {
    await refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", amount: generationCount, now: usagePeriodDate });
    throw error;
  }
}

export async function generateWorkspaceContentForSlot(workspaceId: string, input: GenerateContentForSlotInput): Promise<ContentRecord> {
  const scheduledAt = parseFutureScheduleTime(input.scheduledAt);
  const score = await getVaultScore(workspaceId);

  if (score.entryCount === 0) {
    throw new ContentContextMissingError();
  }

  const campaign = await findCampaign(workspaceId, input.campaignId);
  const context = await searchVaultContext(workspaceId, {
    query: input.topic,
    topK: 8
  });
  const toneLock = await getContentToneLock(workspaceId);
  const lockedContext = mergeVaultContext(context, toneLock.context);
  const promptTemplate = await selectPromptTemplateForRun(
    workspaceId,
    contentAgentName,
    `${workspaceId}:${input.topic}:${input.contentType}:slot:${input.scheduledAt}:${input.campaignId ?? "orphan"}`
  );
  const usagePeriodDate = new Date();
  await reserveWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usagePeriodDate });

  try {
    const generated = await generateContentDrafts({
      workspaceId,
      topic: input.topic,
      contentType: input.contentType,
      count: 1,
      context: lockedContext,
      toneLock: toneLock.lock,
      ...(promptTemplate === undefined ? {} : { promptTemplate: { body: promptTemplate.body, version: promptTemplate.version } }),
      ...(campaign === undefined ? {} : { campaign })
    });
    const promptVersion = promptTemplate?.version ?? generated.prompt_version;
    const [draft] = generated.drafts;

    if (!draft) {
      throw new Error("AI content generation returned no drafts");
    }

    const saved = await prisma.$transaction(async (tx) => {
      const row = await tx.contentItem.create({
        data: {
          workspaceId,
          contentType: draft.contentType,
          status: "SCHEDULED",
          scheduledAt,
          ...(draft.captionEn === undefined ? {} : { captionEn: draft.captionEn }),
          ...(draft.captionAr === undefined ? {} : { captionAr: draft.captionAr }),
          hashtags: draft.hashtags,
          ...(draft.callToAction === undefined ? {} : { callToAction: draft.callToAction }),
          mediaIds: [],
          ...(draft.carousel === undefined ? {} : { carousel: draft.carousel as unknown as Prisma.InputJsonValue }),
          ...(draft.reelScript === undefined ? {} : { reelScript: draft.reelScript as unknown as Prisma.InputJsonValue }),
          ...(draft.contentPillar === undefined ? {} : { contentPillar: draft.contentPillar }),
          ...(input.campaignId === undefined ? {} : { campaignId: input.campaignId }),
          aiPromptUsed: promptVersion
        }
      });

      await addToContentCalendar(tx, workspaceId, row.id, scheduledAt);
      await tx.aiInteraction.create({
        data: {
          workspaceId,
          agent: contentAgentName,
          promptVersion,
          prompt: {
            topic: input.topic,
            contentType: input.contentType,
            count: 1,
            scheduledAt: input.scheduledAt,
            ...(input.campaignId === undefined ? {} : { campaignId: input.campaignId }),
            ...(promptTemplate === undefined ? {} : { promptTemplate }),
            toneLock: toneLock.lock,
            retrievedContext: lockedContext
          } as unknown as Prisma.InputJsonValue,
          response: {
            drafts: generated.drafts,
            scheduledContentItemId: row.id,
            providerPromptVersion: generated.prompt_version
          } as unknown as Prisma.InputJsonValue,
          tokensIn: generated.tokens_in,
          tokensOut: generated.tokens_out,
          costMinor: 0,
          currency: localCurrency,
          model: generated.model || env.LLM_PRIMARY_MODEL
        }
      });
      await recordAiTokenUsage({
        client: tx,
        workspaceId,
        tokensIn: generated.tokens_in,
        tokensOut: generated.tokens_out,
        now: usagePeriodDate
      });

      return row;
    });

    return toContentRecord(saved);
  } catch (error) {
    await refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usagePeriodDate });
    throw error;
  }
}

export async function updateContentItem(workspaceId: string, contentItemId: string, input: UpdateContentInput): Promise<ContentRecord> {
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
      ...(input.reelScript === undefined ? {} : { reelScript: input.reelScript as unknown as Prisma.InputJsonValue }),
      ...(input.plannedAt === undefined ? {} : { plannedAt: input.plannedAt === null ? null : new Date(input.plannedAt) })
    }
  });

  return toContentRecord(row);
}

export async function deleteContentItem(workspaceId: string, contentItemId: string): Promise<{ id: string }> {
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

  if (current.status === "SCHEDULED") {
    throw new ContentItemDeleteError("Cancel the scheduled publishing time before deleting this post draft", "CONTENT_DELETE_REQUIRES_CANCELLATION");
  }

  if (current.status === "PUBLISHED") {
    throw new ContentItemDeleteError("Published Instagram posts cannot be deleted through the draft deletion action", "CONTENT_DELETE_FORBIDDEN");
  }

  await prisma.contentItem.update({
    where: {
      id: current.id
    },
    data: {
      deletedAt: new Date()
    }
  });

  return { id: current.id };
}

export async function updateContentItemStatus(workspaceId: string, contentItemId: string, input: UpdateContentStatusInput): Promise<ContentRecord> {
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

export async function scheduleContentItem(workspaceId: string, contentItemId: string, input: ScheduleContentInput): Promise<ContentRecord> {
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

  const scheduledAt = parseFutureScheduleTime(input.scheduledAt);

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

export async function rescheduleContentItem(workspaceId: string, contentItemId: string, input: ScheduleContentInput): Promise<ContentRecord> {
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

  if (current.status !== "SCHEDULED" && current.status !== "FAILED") {
    throw new ContentScheduleError("Only scheduled or failed content can be rescheduled");
  }

  const scheduledAt = parseFutureScheduleTime(input.scheduledAt);
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.contentItem.update({
      where: {
        id: current.id
      },
      data: {
        failureReason: null,
        scheduledAt,
        status: "SCHEDULED"
      }
    });

    if (current.scheduledAt) {
      await removeFromContentCalendar(tx, workspaceId, current.id, current.scheduledAt);
    }
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
        plannedAt: null,
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

async function addToContentCalendar(tx: Prisma.TransactionClient, workspaceId: string, contentItemId: string, scheduledAt: Date): Promise<void> {
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

async function removeFromContentCalendar(tx: Prisma.TransactionClient, workspaceId: string, contentItemId: string, scheduledAt: Date): Promise<void> {
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

function mergeCalendarPlan(value: Prisma.JsonValue | undefined, contentItemId: string, mode: "add" | "remove" = "add"): { scheduledContentIds: string[] } {
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

function parseFutureScheduleTime(value: string): Date {
  const scheduledAt = new Date(value);

  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
    throw new ContentScheduleError("Schedule time must be in the future");
  }

  return scheduledAt;
}

async function getContentToneLock(workspaceId: string): Promise<{ context: VaultRagChunk[]; lock: ContentToneLock }> {
  const [brandEntries, toneEntries] = await Promise.all([listVaultSection(workspaceId, "BRAND"), listVaultSection(workspaceId, "TONE")]);
  const toneWords = uniqueStrings(
    toneEntries.flatMap((entry) => {
      const value = entry.value.toneWords;
      return Array.isArray(value) ? value : [];
    })
  );
  const voiceNotes = firstString(toneEntries.map((entry) => entry.value.voiceNotes));
  const brandHints = Object.fromEntries(brandEntries.map((entry) => [entry.key, entry.value]));
  const context: VaultRagChunk[] = [...brandEntries, ...toneEntries].map((entry) => ({
    id: entry.id,
    section: entry.section,
    key: entry.key,
    value: entry.value,
    version: entry.version,
    score: 1
  }));

  return {
    context,
    lock: {
      requiredLanguages: ["ar", "en"],
      toneWords,
      ...(voiceNotes === undefined ? {} : { voiceNotes }),
      brandHints
    }
  };
}

function mergeVaultContext(primary: VaultRagChunk[], locked: VaultRagChunk[]): VaultRagChunk[] {
  const seen = new Set<string>();
  const merged: VaultRagChunk[] = [];

  for (const chunk of [...locked, ...primary]) {
    if (seen.has(chunk.id)) {
      continue;
    }

    seen.add(chunk.id);
    merged.push(chunk);
  }

  return merged.slice(0, 10);
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
}

function firstString(values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0);
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

async function findCampaign(workspaceId: string, campaignId: string | undefined): Promise<CampaignPlan | undefined> {
  if (campaignId === undefined) {
    return undefined;
  }

  const row = await prisma.campaign.findFirst({
    where: {
      workspaceId,
      deletedAt: null,
      id: campaignId
    }
  });

  if (!row) {
    throw new ContentCampaignNotFoundError();
  }

  return row.content as unknown as CampaignPlan;
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
  plannedAt: Date | null;
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
    ...(row.plannedAt === null ? {} : { plannedAt: row.plannedAt.toISOString() }),
    ...(row.scheduledAt === null ? {} : { scheduledAt: row.scheduledAt.toISOString() }),
    ...(row.publishedAt === null ? {} : { publishedAt: row.publishedAt.toISOString() }),
    ...(row.instagramPostId === null ? {} : { instagramPostId: row.instagramPostId }),
    ...(row.failureReason === null ? {} : { failureReason: row.failureReason }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
