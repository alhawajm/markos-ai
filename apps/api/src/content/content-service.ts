import { assertContentReady } from "../media/content-media-integrity";
import { z } from "zod";
import { updateContentSchema, updateContentStatusSchema } from "@markos/validation";
import { Prisma, type ContentStatus } from "@prisma/client";
import type { CampaignPlan, ContentDraft, ContentRecord, ContentToneLock, VaultRagChunk } from "@markos/shared-types";
import type {
  CreateContentInput,
  GenerateContentInput,
  IdeateContentInput,
  ScheduleContentInput,
  UpdateContentInput,
  UpdateContentStatusInput
} from "@markos/validation";
import { generateContentDrafts } from "../ai/content-client";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import {
  contentAggregateInclude,
  createContentAggregate,
  getContentAggregate,
  loadContentAggregate,
  lockContentRoot,
  mutateContentAggregate,
  toContentRecord
} from "./content-aggregate";
export { toContentRecord } from "./content-aggregate";
import { selectPromptTemplateForRun } from "../prompts/prompt-service";
import { recordAiTokenUsage, refundWorkspaceUsage, reserveWorkspaceUsage } from "../usage/usage-service";
import { getVaultScore, listVaultSection, searchVaultContext } from "../vault/vault-service";

const contentAgentName = "CONTENT";
const localCurrency = "BHD";

import { ContentConflictError } from "./content-conflict";

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
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.contentItem.findMany({
        where: { workspaceId, deletedAt: null },
        include: contentAggregateInclude,
        orderBy: { createdAt: "desc" },
        take: 50
      });
      return rows.map(toContentRecord);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
}
export async function createWorkspaceContent(workspaceId: string, input: CreateContentInput): Promise<ContentRecord> {
  return prisma.$transaction((tx) => createContentAggregate(tx, workspaceId, input));
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
        const record = await createContentAggregate(tx, workspaceId, {
          platform: "INSTAGRAM",
          contentType: draft.contentType,
          caption: draft.caption,
          contentPillar: draft.contentPillar,
          tone: toneLock.lock.toneWords.join(", ") || null
        });
        await tx.contentItem.update({
          where: { id: record.id },
          data: {
            campaignId: input.campaignId ?? null,
            aiPromptUsed: promptVersion
          }
        });
        const initial = record.mediaItems[0]!;
        await tx.contentMediaItem.update({ where: { id: initial.id }, data: { visualDirection: draft.visualDirection ?? null } });
        if (draft.contentType === "CAROUSEL" && draft.carousel) {
          const slides = generatedCarouselSchema.parse(draft.carousel).slides;
          for (const [position, slide] of slides.entries()) {
            if (position === 0) await tx.contentMediaItem.update({ where: { id: initial.id }, data: slide });
            else
              await tx.contentMediaItem.create({
                data: { workspaceId, contentItemId: record.id, position, mediaKind: "IMAGE", ...slide, visualDirection: draft.visualDirection ?? null }
              });
          }
        }
        if (draft.contentType === "REEL" && draft.reelScript) {
          const script = generatedReelSchema.parse(draft.reelScript);
          await tx.contentReelScript.create({
            data: {
              workspaceId,
              contentItemId: record.id,
              hook: script.hook,
              intendedDurationSeconds: script.durationSeconds,
              beats: { create: script.beats.map((text, position) => ({ position, text })) }
            }
          });
        }
        rows.push(toContentRecord(await loadContentAggregate(tx, workspaceId, record.id)));
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

    return saved;
  } catch (error) {
    await refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", amount: generationCount, now: usagePeriodDate });
    throw error;
  }
}

export async function ideateWorkspaceContent(workspaceId: string, input: IdeateContentInput): Promise<ContentDraft> {
  const score = await getVaultScore(workspaceId);
  if (score.entryCount === 0) {
    throw new ContentContextMissingError();
  }

  const campaign = await findCampaign(workspaceId, input.campaignId);
  const context = await searchVaultContext(workspaceId, { query: input.topic, topK: 8 });
  const toneLock = await getContentToneLock(workspaceId);
  const lockedContext = mergeVaultContext(context, toneLock.context);
  const promptTemplate = await selectPromptTemplateForRun(
    workspaceId,
    contentAgentName,
    `${workspaceId}:ideation:${input.topic}:${input.contentType}:${input.campaignId ?? "orphan"}`
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
    const idea = generated.drafts[0];
    if (!idea) throw new Error("AI content ideation returned no draft");
    const promptVersion = promptTemplate?.version ?? generated.prompt_version;

    await prisma.$transaction(async (tx) => {
      await tx.aiInteraction.create({
        data: {
          workspaceId,
          agent: contentAgentName,
          promptVersion,
          prompt: {
            mode: "IDEATION",
            topic: input.topic,
            contentType: input.contentType,
            ...(input.campaignId === undefined ? {} : { campaignId: input.campaignId }),
            ...(promptTemplate === undefined ? {} : { promptTemplate }),
            toneLock: toneLock.lock,
            retrievedContext: lockedContext
          } as unknown as Prisma.InputJsonValue,
          response: { idea, providerPromptVersion: generated.prompt_version } as unknown as Prisma.InputJsonValue,
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
    });

    return idea;
  } catch (error) {
    await refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usagePeriodDate });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw new ContentConflictError();
    throw error;
  }
}

// Shared-field edits use the same revision-checked aggregate as targeted authoring.
export async function updateContentItem(workspaceId: string, contentItemId: string, raw: UpdateContentInput): Promise<ContentRecord> {
  const { expectedRevision, ...fields } = updateContentSchema.parse(raw);
  return mutateContentAggregate(workspaceId, contentItemId, { expectedRevision, operations: [{ type: "updateContent", fields }] });
}

export async function deleteContentItem(workspaceId: string, contentItemId: string, expectedRevision: number): Promise<{ id: string }> {
  revisionSchema.parse(expectedRevision);
  return prisma.$transaction(async (tx) => {
    const row = await lockContentRoot(tx, workspaceId, contentItemId, expectedRevision);
    if (row.status === "SCHEDULED") throw new ContentItemDeleteError("Cancel publishing before deleting content", "CONTENT_DELETE_REQUIRES_CANCELLATION");
    if (!["DRAFT", "IN_REVIEW", "APPROVED", "FAILED"].includes(row.status))
      throw new ContentItemDeleteError("Cancel publishing before deleting content", "CONTENT_DELETE_FORBIDDEN");
    await cancelUnclaimedPublishJobs(tx, workspaceId, contentItemId);
    await tx.contentItem.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
    return { id: row.id };
  });
}
export async function updateContentItemStatus(workspaceId: string, contentItemId: string, raw: UpdateContentStatusInput): Promise<ContentRecord> {
  const input = updateContentStatusSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const row = await lockContentRoot(tx, workspaceId, contentItemId, input.expectedRevision);
    if (!isAllowedContentTransition(row.status, input.status)) throw new ContentStatusTransitionError();
    if (input.status === "APPROVED") await assertContentReady(tx, row);
    await tx.contentItem.update({ where: { id: row.id }, data: { status: input.status } });
    return toContentRecord(await loadContentAggregate(tx, workspaceId, row.id));
  });
}

export async function scheduleContentItem(workspaceId: string, contentItemId: string, input: ScheduleContentInput): Promise<ContentRecord> {
  const scheduledAt = parseFutureScheduleTime(input.scheduledAt);
  const row = await prisma.$transaction(async (tx) => {
    const current = await lockContentRoot(tx, workspaceId, contentItemId);
    if (!current) throw new ContentItemNotFoundError();
    await cancelUnclaimedPublishJobs(tx, workspaceId, contentItemId);
    if (current.status !== "APPROVED") throw new ContentScheduleError();
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

  return getContentAggregate(workspaceId, row.id);
}

export async function rescheduleContentItem(workspaceId: string, contentItemId: string, input: ScheduleContentInput): Promise<ContentRecord> {
  const scheduledAt = parseFutureScheduleTime(input.scheduledAt);
  const row = await prisma.$transaction(async (tx) => {
    const current = await lockContentRoot(tx, workspaceId, contentItemId);
    if (!current) throw new ContentItemNotFoundError();
    await cancelUnclaimedPublishJobs(tx, workspaceId, contentItemId);
    if (current.status !== "SCHEDULED" && current.status !== "FAILED") {
      throw new ContentScheduleError("Only scheduled or failed content can be rescheduled");
    }
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

  return getContentAggregate(workspaceId, row.id);
}

export async function unscheduleContentItem(workspaceId: string, contentItemId: string): Promise<ContentRecord> {
  const row = await prisma.$transaction(async (tx) => {
    const current = await lockContentRoot(tx, workspaceId, contentItemId);
    if (!current) throw new ContentItemNotFoundError();
    await cancelUnclaimedPublishJobs(tx, workspaceId, contentItemId);
    if (current.status !== "SCHEDULED") throw new ContentScheduleError("Only scheduled content can be unscheduled");
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

  return getContentAggregate(workspaceId, row.id);
}

/** Caller holds the content row lock shared with publish queueing/claiming. */
export async function cancelUnclaimedPublishJobs(tx: Prisma.TransactionClient, workspaceId: string, contentItemId: string): Promise<void> {
  const processing = await tx.publishJob.findFirst({ where: { workspaceId, contentItemId, status: "PROCESSING" }, select: { id: true } });
  if (processing) {
    throw new ContentScheduleError("Publishing has started. Wait for the result before changing or cancelling its schedule.");
  }
  await tx.publishJob.updateMany({
    where: { workspaceId, contentItemId, status: { in: ["QUEUED", "RETRY_WAIT"] } },
    data: { status: "CANCELLED", leasedAt: null, leaseExpiresAt: null }
  });
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

  if (scheduledAt.getUTCMinutes() % 30 !== 0 || scheduledAt.getUTCSeconds() !== 0 || scheduledAt.getUTCMilliseconds() !== 0) {
    throw new ContentScheduleError("Choose a publishing time on a 30-minute boundary, such as 9:00 or 9:30");
  }

  return scheduledAt;
}

export async function getContentToneLock(workspaceId: string): Promise<{ context: VaultRagChunk[]; lock: ContentToneLock }> {
  const [brandEntries, toneEntries, objectiveEntries] = await Promise.all([
    listVaultSection(workspaceId, "BRAND"),
    listVaultSection(workspaceId, "TONE"),
    listVaultSection(workspaceId, "OBJECTIVES")
  ]);
  const toneWords = uniqueStrings(
    toneEntries.flatMap((entry) => {
      const value = entry.value.toneWords;
      return Array.isArray(value) ? value : [];
    })
  );
  const voiceNotes = firstString(toneEntries.map((entry) => entry.value.voiceNotes));
  const brandHints = Object.fromEntries(brandEntries.map((entry) => [entry.key, entry.value]));
  const context: VaultRagChunk[] = [...brandEntries, ...toneEntries, ...objectiveEntries.filter((entry) => entry.key === "goals")].map((entry) => ({
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
      preferredLanguages: ["en", "ar"],
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
    DRAFT: ["IN_REVIEW", "APPROVED"],
    IN_REVIEW: ["APPROVED", "DRAFT"]
  };

  return allowed[current as UpdateContentStatusInput["status"]]?.includes(next) ?? false;
}

export async function findCampaign(workspaceId: string, campaignId: string | undefined): Promise<CampaignPlan | undefined> {
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

const revisionSchema = z.number().int().positive();
const generatedCarouselSchema = z.object({
  slides: z
    .array(z.object({ title: z.string().max(160), body: z.string().max(800) }))
    .min(1)
    .max(10)
});
const generatedReelSchema = z.object({ hook: z.string().max(300), durationSeconds: z.number().int().positive(), beats: z.array(z.string().max(800)).max(100) });
