import type { ContentStatus, ContentType, Prisma } from "@prisma/client";
import type { ContentRecord, StrategyPlan } from "@markos/shared-types";
import type { GenerateContentInput } from "@markos/validation";
import { generateContentDrafts } from "../ai/content-client";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { getVaultScore, searchVaultContext } from "../vault/vault-service";

const contentAgentName = "CONTENT";
const localCurrency = "BHD";

export class ContentContextMissingError extends Error {
  constructor() {
    super("Complete at least one Vault section before generating content");
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

function toContentRecord(row: {
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
