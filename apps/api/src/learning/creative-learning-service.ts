import type {
  CreativeFeedback,
  CreativeLearningExemplar,
  GeneratedMediaVariant,
  InstagramAnalytics,
  Prisma,
} from "@prisma/client";
import type {
  CreativeFeedbackDecision,
  CreativeFeedbackReasonCode,
  CreativeFeedbackRecord,
  CreativeLearningContext,
  CreativeLearningExemplarRecord,
  CreativeLearningInsights,
  CreativeLearningRunResult,
  CreativeLearningWorkspaceResult,
  CreativePatternType,
  CreativeQualityScores,
  VaultRagChunk,
} from "@markos/shared-types";
import type {
  ApproveGeneratedMediaVariantInput,
  RejectGeneratedMediaVariantInput,
} from "@markos/validation";
import { prisma } from "../db/prisma";
import { upsertVaultSection } from "../vault/vault-service";

export class CreativeLearningVariantNotFoundError extends Error {
  constructor() {
    super("Generated media variant was not found");
  }
}

export interface GeneratedMediaFeedbackResult {
  feedback: CreativeFeedbackRecord;
  variant: GeneratedMediaVariant;
}

interface CreativeFeedbackInput {
  decision: CreativeFeedbackDecision;
  notes?: string;
  reasonCodes: CreativeFeedbackReasonCode[];
  scores?: CreativeQualityScores;
}

interface PerformanceTotals {
  comments: number;
  engagement: number;
  impressions: number;
  likes: number;
  reach: number;
  saves: number;
  shares: number;
  views: number;
}

const learningVaultPrefix = "creative.learning";

export function buildInitialCreativeQualityScores(input: {
  hasCatalogContext: boolean;
  hasContentContext: boolean;
  hasSourceMedia: boolean;
  hasVaultContext: boolean;
}): CreativeQualityScores {
  const brandAlignment = input.hasVaultContext ? 82 : 58;
  const productAccuracy = input.hasCatalogContext
    ? input.hasSourceMedia
      ? 90
      : 78
    : input.hasSourceMedia
      ? 74
      : 55;
  const composition = input.hasContentContext ? 80 : 72;
  const platformReadiness = 84;

  return withOverallScore({
    brandAlignment,
    composition,
    platformReadiness,
    productAccuracy,
  });
}

export async function recordGeneratedMediaFeedback(
  workspaceId: string,
  actorId: string,
  variantId: string,
  input:
    | ({ decision: "APPROVED" } & ApproveGeneratedMediaVariantInput)
    | ({ decision: "REJECTED" } & RejectGeneratedMediaVariantInput),
): Promise<GeneratedMediaFeedbackResult> {
  const variant = await prisma.generatedMediaVariant.findFirst({
    where: {
      id: variantId,
      workspaceId,
      deletedAt: null,
    },
  });

  if (variant === null) {
    throw new CreativeLearningVariantNotFoundError();
  }

  const normalized = normalizeFeedbackInput(input);
  const qualityScores = mergeQualityScores(
    toQualityScores(variant.qualityScores),
    normalized.scores,
  );
  const now = new Date();
  const summary = humanFeedbackSummary(variant, normalized);
  const patternType: CreativePatternType =
    normalized.decision === "APPROVED" ? "POSITIVE" : "NEGATIVE";
  const score = feedbackConfidence(normalized, qualityScores);

  const saved = await prisma.$transaction(async (tx) => {
    const feedback = await tx.creativeFeedback.create({
      data: {
        workspaceId,
        generatedMediaVariantId: variant.id,
        ...(variant.aiInteractionId === null
          ? {}
          : { aiInteractionId: variant.aiInteractionId }),
        decision: normalized.decision,
        reasonCodes: normalized.reasonCodes,
        ...(normalized.notes === undefined ? {} : { notes: normalized.notes }),
        scores: qualityScores as Prisma.InputJsonValue,
        createdBy: actorId,
      },
    });
    const updatedVariant = await tx.generatedMediaVariant.update({
      where: {
        id: variant.id,
      },
      data: {
        qualityScores: qualityScores as Prisma.InputJsonValue,
        qualityStatus:
          normalized.decision === "APPROVED" ? "APPROVED" : "REJECTED",
        rejectionReason:
          normalized.decision === "APPROVED"
            ? null
            : (normalized.notes ?? normalized.reasonCodes.join(", ")),
        status: normalized.decision === "APPROVED" ? "APPROVED" : "REJECTED",
      },
    });

    if (variant.aiInteractionId !== null) {
      const interaction = await tx.aiInteraction.findFirst({
        where: {
          id: variant.aiInteractionId,
          workspaceId,
          deletedAt: null,
        },
      });

      if (interaction !== null) {
        await tx.aiInteraction.update({
          where: {
            id: interaction.id,
          },
          data: {
            accepted: normalized.decision === "APPROVED",
            response: {
              ...toRecord(interaction.response),
              creativeFeedback: {
                decision: normalized.decision,
                feedbackId: feedback.id,
                notes: normalized.notes ?? null,
                reasonCodes: normalized.reasonCodes,
                scores: qualityScores,
                recordedAt: now.toISOString(),
              },
            } as unknown as Prisma.InputJsonValue,
          },
        });
      }
    }

    await tx.creativeLearningExemplar.upsert({
      where: {
        workspaceId_patternKey: {
          workspaceId,
          patternKey: `human.visual.${variant.id}`,
        },
      },
      create: {
        workspaceId,
        source: "HUMAN_FEEDBACK",
        patternType,
        generatedMediaVariantId: variant.id,
        ...(variant.contentItemId === null
          ? {}
          : { contentItemId: variant.contentItemId }),
        ...(variant.aiInteractionId === null
          ? {}
          : { aiInteractionId: variant.aiInteractionId }),
        patternKey: `human.visual.${variant.id}`,
        summary,
        evidence: humanFeedbackEvidence(variant, normalized, qualityScores),
        score,
        lastObservedAt: now,
      },
      update: {
        active: true,
        patternType,
        summary,
        evidence: humanFeedbackEvidence(variant, normalized, qualityScores),
        score,
        lastObservedAt: now,
        vaultSyncedAt: null,
        vaultSyncError: null,
        deletedAt: null,
      },
    });

    return {
      feedback: toCreativeFeedbackRecord(feedback),
      variant: updatedVariant,
    };
  });

  await syncExemplarsToVault(workspaceId, [
    await prisma.creativeLearningExemplar.findUniqueOrThrow({
      where: {
        workspaceId_patternKey: {
          workspaceId,
          patternKey: `human.visual.${variant.id}`,
        },
      },
    }),
  ]);

  return saved;
}

export async function recordCampaignRejectionLearning(input: {
  workspaceId: string;
  campaignId: string;
  contentItemId: string;
  reason: string;
  snapshot: Record<string, unknown>;
  now?: Date;
}): Promise<CreativeLearningExemplarRecord> {
  const now = input.now ?? new Date();
  const summary = `Avoid this rejected campaign pattern: ${input.reason.trim()}`;
  const exemplar = await prisma.creativeLearningExemplar.upsert({
    where: {
      workspaceId_patternKey: {
        workspaceId: input.workspaceId,
        patternKey: `campaign.rejection.${input.contentItemId}`,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      source: "CAMPAIGN_REVIEW",
      patternType: "NEGATIVE",
      campaignId: input.campaignId,
      contentItemId: input.contentItemId,
      patternKey: `campaign.rejection.${input.contentItemId}`,
      summary,
      evidence: {
        reason: input.reason.trim(),
        snapshot: input.snapshot,
      } as Prisma.InputJsonValue,
      score: 1,
      lastObservedAt: now,
    },
    update: {
      active: true,
      patternType: "NEGATIVE",
      summary,
      evidence: {
        reason: input.reason.trim(),
        snapshot: input.snapshot,
      } as Prisma.InputJsonValue,
      score: 1,
      lastObservedAt: now,
      vaultSyncedAt: null,
      vaultSyncError: null,
      deletedAt: null,
    },
  });

  await syncExemplarsToVault(input.workspaceId, [exemplar]);
  return toCreativeLearningExemplarRecord(exemplar);
}

export async function getCreativeLearningContext(
  workspaceId: string,
  limit = 5,
): Promise<CreativeLearningContext> {
  const take = Math.min(Math.max(Math.trunc(limit), 1), 10);
  const [positive, negative] = await Promise.all([
    prisma.creativeLearningExemplar.findMany({
      where: {
        workspaceId,
        active: true,
        deletedAt: null,
        patternType: "POSITIVE",
      },
      orderBy: [{ score: "desc" }, { lastObservedAt: "desc" }],
      take,
    }),
    prisma.creativeLearningExemplar.findMany({
      where: {
        workspaceId,
        active: true,
        deletedAt: null,
        patternType: "NEGATIVE",
      },
      orderBy: [{ score: "desc" }, { lastObservedAt: "desc" }],
      take,
    }),
  ]);

  return {
    positive: positive.map(toCreativeLearningExemplarRecord),
    negative: negative.map(toCreativeLearningExemplarRecord),
  };
}

export async function getCreativeLearningVaultChunks(
  workspaceId: string,
  limit = 5,
): Promise<VaultRagChunk[]> {
  const context = await getCreativeLearningContext(workspaceId, limit);

  return [...context.positive, ...context.negative].map((exemplar) => ({
    id: exemplar.id,
    section: "OBJECTIVES",
    key: `${learningVaultPrefix}.${exemplar.patternKey}`,
    value: exemplarVaultValue(exemplar),
    version: 1,
    score: exemplar.score,
  }));
}

export async function getCreativeLearningInsights(
  workspaceId: string,
): Promise<CreativeLearningInsights> {
  const [
    context,
    feedbackCount,
    performanceLinkedCount,
    positivePatternCount,
    negativePatternCount,
  ] = await Promise.all([
    getCreativeLearningContext(workspaceId, 5),
    prisma.creativeFeedback.count({
      where: { workspaceId, deletedAt: null },
    }),
    prisma.creativeLearningExemplar.count({
      where: {
        workspaceId,
        source: "INSTAGRAM_PERFORMANCE",
        active: true,
        deletedAt: null,
      },
    }),
    prisma.creativeLearningExemplar.count({
      where: {
        workspaceId,
        patternType: "POSITIVE",
        active: true,
        deletedAt: null,
      },
    }),
    prisma.creativeLearningExemplar.count({
      where: {
        workspaceId,
        patternType: "NEGATIVE",
        active: true,
        deletedAt: null,
      },
    }),
  ]);

  return {
    workspaceId,
    generatedAt: new Date().toISOString(),
    feedbackCount,
    performanceLinkedCount,
    positivePatternCount,
    negativePatternCount,
    topPositive: context.positive,
    topNegative: context.negative,
    recommendations: buildRecommendations(context),
  };
}

export async function processCreativeLearningForAllWorkspaces(
  input: { days?: number; now?: Date; workspaceIds?: string[] } = {},
): Promise<CreativeLearningRunResult> {
  const workspaces = await prisma.workspace.findMany({
    where: {
      deletedAt: null,
      ...(input.workspaceIds === undefined
        ? {}
        : {
            id: {
              in: input.workspaceIds,
            },
          }),
    },
    select: {
      id: true,
    },
  });
  const results: CreativeLearningWorkspaceResult[] = [];

  for (const workspace of workspaces) {
    results.push(
      await processWorkspaceCreativeLearning(workspace.id, {
        ...(input.days === undefined ? {} : { days: input.days }),
        ...(input.now === undefined ? {} : { now: input.now }),
      }),
    );
  }

  return {
    attempted: workspaces.length,
    results,
  };
}

export async function processWorkspaceCreativeLearning(
  workspaceId: string,
  input: { days?: number; now?: Date } = {},
): Promise<CreativeLearningWorkspaceResult> {
  const now = input.now ?? new Date();
  const days = Math.min(Math.max(Math.trunc(input.days ?? 30), 1), 90);
  const from = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const analytics = await prisma.instagramAnalytics.findMany({
    where: {
      workspaceId,
      dataDate: { gte: from, lte: now },
      contentItemId: { not: null },
      deletedAt: null,
    },
    orderBy: [{ dataDate: "desc" }, { syncedAt: "desc" }],
  });
  const performance = aggregateContentPerformance(analytics);
  const contentItems = await prisma.contentItem.findMany({
    where: {
      workspaceId,
      id: { in: [...performance.keys()] },
      deletedAt: null,
    },
  });
  const rates = contentItems
    .map((item) => performance.get(item.id)?.engagementRate ?? 0)
    .filter((rate) => rate > 0);
  const baseline = median(rates) || 0.01;
  const variants = await prisma.generatedMediaVariant.findMany({
    where: {
      workspaceId,
      deletedAt: null,
      mediaAssetId: {
        in: contentItems.flatMap((item) => item.mediaIds),
      },
    },
  });
  const variantsByContent = new Map<string, GeneratedMediaVariant[]>();

  for (const variant of variants) {
    const linkedContentIds = contentItems
      .filter((item) => item.mediaIds.includes(variant.mediaAssetId))
      .map((item) => item.id);

    for (const contentItemId of linkedContentIds) {
      variantsByContent.set(contentItemId, [
        ...(variantsByContent.get(contentItemId) ?? []),
        variant,
      ]);
    }
  }

  const exemplars: CreativeLearningExemplar[] = [];
  let interactionsUpdated = 0;
  let linkedVariants = 0;

  await prisma.$transaction(async (tx) => {
    for (const item of contentItems) {
      const itemPerformance = performance.get(item.id);

      if (itemPerformance === undefined) {
        continue;
      }

      const patternType = classifyPerformance(
        itemPerformance.engagementRate,
        baseline,
      );
      const score = performanceConfidence(
        itemPerformance.engagementRate,
        baseline,
      );
      const performanceScore = Math.round(
        Math.min(
          100,
          (itemPerformance.engagementRate / Math.max(baseline * 2, 0.0001)) *
            100,
        ),
      );
      const contentSummary = performanceSummary({
        caption: item.captionEn ?? item.captionAr,
        contentType: item.contentType,
        engagementRate: itemPerformance.engagementRate,
        patternType,
        reach: itemPerformance.totals.reach,
      });
      const contentExemplar = await tx.creativeLearningExemplar.upsert({
        where: {
          workspaceId_patternKey: {
            workspaceId,
            patternKey: `performance.content.${item.id}`,
          },
        },
        create: {
          workspaceId,
          source: "INSTAGRAM_PERFORMANCE",
          patternType,
          contentItemId: item.id,
          ...(item.campaignId === null ? {} : { campaignId: item.campaignId }),
          patternKey: `performance.content.${item.id}`,
          summary: contentSummary,
          evidence: performanceEvidence(
            itemPerformance,
            baseline,
            item,
          ) as unknown as Prisma.InputJsonValue,
          score,
          lastObservedAt: now,
        },
        update: {
          active: true,
          patternType,
          summary: contentSummary,
          evidence: performanceEvidence(
            itemPerformance,
            baseline,
            item,
          ) as unknown as Prisma.InputJsonValue,
          score,
          lastObservedAt: now,
          vaultSyncedAt: null,
          vaultSyncError: null,
          deletedAt: null,
        },
      });
      exemplars.push(contentExemplar);

      for (const variant of variantsByContent.get(item.id) ?? []) {
        linkedVariants += 1;
        const visualSummary = `${contentSummary} Visual mode ${variant.visualMode}, aspect ratio ${variant.aspectRatio}.`;
        const visualExemplar = await tx.creativeLearningExemplar.upsert({
          where: {
            workspaceId_patternKey: {
              workspaceId,
              patternKey: `performance.visual.${variant.id}`,
            },
          },
          create: {
            workspaceId,
            source: "INSTAGRAM_PERFORMANCE",
            patternType,
            generatedMediaVariantId: variant.id,
            contentItemId: item.id,
            ...(item.campaignId === null
              ? {}
              : { campaignId: item.campaignId }),
            ...(variant.aiInteractionId === null
              ? {}
              : { aiInteractionId: variant.aiInteractionId }),
            patternKey: `performance.visual.${variant.id}`,
            summary: visualSummary,
            evidence: {
              ...performanceEvidence(itemPerformance, baseline, item),
              aspectRatio: variant.aspectRatio,
              prompt: variant.prompt,
              visualMode: variant.visualMode,
            } as unknown as Prisma.InputJsonValue,
            score,
            lastObservedAt: now,
          },
          update: {
            active: true,
            patternType,
            summary: visualSummary,
            evidence: {
              ...performanceEvidence(itemPerformance, baseline, item),
              aspectRatio: variant.aspectRatio,
              prompt: variant.prompt,
              visualMode: variant.visualMode,
            } as unknown as Prisma.InputJsonValue,
            score,
            lastObservedAt: now,
            vaultSyncedAt: null,
            vaultSyncError: null,
            deletedAt: null,
          },
        });
        exemplars.push(visualExemplar);
        await tx.generatedMediaVariant.update({
          where: { id: variant.id },
          data: {
            performanceScore,
            lastLearnedAt: now,
          },
        });

        if (variant.aiInteractionId !== null) {
          const interaction = await tx.aiInteraction.findFirst({
            where: {
              id: variant.aiInteractionId,
              workspaceId,
              deletedAt: null,
            },
          });

          if (interaction !== null) {
            await tx.aiInteraction.update({
              where: { id: interaction.id },
              data: {
                response: {
                  ...toRecord(interaction.response),
                  creativePerformance: {
                    baselineEngagementRate: baseline,
                    contentItemId: item.id,
                    engagementRate: itemPerformance.engagementRate,
                    patternType,
                    performanceScore,
                    recordedAt: now.toISOString(),
                    totals: itemPerformance.totals,
                  },
                } as unknown as Prisma.InputJsonValue,
              },
            });
            interactionsUpdated += 1;
          }
        }
      }
    }
  });

  const deduplicated = [
    ...new Map(exemplars.map((exemplar) => [exemplar.id, exemplar])).values(),
  ];
  const pendingVaultSync = await prisma.creativeLearningExemplar.findMany({
    where: {
      workspaceId,
      active: true,
      deletedAt: null,
      vaultSyncedAt: null,
    },
    orderBy: { lastObservedAt: "desc" },
    take: 50,
  });
  const vaultEntriesWritten = await syncExemplarsToVault(
    workspaceId,
    pendingVaultSync,
  );

  return {
    workspaceId,
    analyzedContent: contentItems.length,
    linkedVariants,
    exemplarsUpserted: deduplicated.length,
    interactionsUpdated,
    vaultEntriesWritten,
  };
}

export async function latestCreativeFeedbackByVariant(
  workspaceId: string,
  variantIds: string[],
): Promise<Map<string, CreativeFeedbackRecord>> {
  if (variantIds.length === 0) {
    return new Map();
  }

  const feedback = await prisma.creativeFeedback.findMany({
    where: {
      workspaceId,
      generatedMediaVariantId: { in: variantIds },
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
  const byVariant = new Map<string, CreativeFeedbackRecord>();

  for (const item of feedback) {
    if (!byVariant.has(item.generatedMediaVariantId)) {
      byVariant.set(
        item.generatedMediaVariantId,
        toCreativeFeedbackRecord(item),
      );
    }
  }

  return byVariant;
}

function normalizeFeedbackInput(
  input:
    | ({ decision: "APPROVED" } & ApproveGeneratedMediaVariantInput)
    | ({ decision: "REJECTED" } & RejectGeneratedMediaVariantInput),
): CreativeFeedbackInput {
  const notes = input.notes ?? ("reason" in input ? input.reason : undefined);

  return {
    decision: input.decision,
    reasonCodes: [...new Set(input.reasonCodes)],
    ...(notes === undefined ? {} : { notes }),
    ...(input.scores === undefined
      ? {}
      : { scores: normalizedQualityScores(input.scores) }),
  };
}

function mergeQualityScores(
  current: CreativeQualityScores,
  next: CreativeQualityScores | undefined,
): CreativeQualityScores {
  const merged = {
    ...current,
    ...(next ?? {}),
  };

  if (next !== undefined && next.overall === undefined) {
    delete merged.overall;
  }

  return withOverallScore(merged);
}

function withOverallScore(
  scores: CreativeQualityScores,
): CreativeQualityScores {
  if (scores.overall !== undefined) {
    return scores;
  }

  const dimensions = [
    scores.brandAlignment,
    scores.composition,
    scores.platformReadiness,
    scores.productAccuracy,
  ].filter((score): score is number => score !== undefined);

  return dimensions.length === 0
    ? scores
    : {
        ...scores,
        overall: Math.round(
          dimensions.reduce((total, score) => total + score, 0) /
            dimensions.length,
        ),
      };
}

function feedbackConfidence(
  input: CreativeFeedbackInput,
  scores: CreativeQualityScores,
): number {
  const score = scores.overall ?? 75;
  const normalized = input.decision === "APPROVED" ? score : 100 - score;
  return Math.max(0.1, Math.min(1, normalized / 100));
}

function humanFeedbackSummary(
  variant: GeneratedMediaVariant,
  input: CreativeFeedbackInput,
): string {
  const action = input.decision === "APPROVED" ? "Repeat" : "Avoid";
  const reasons = input.reasonCodes.map(humanizeReasonCode).join(", ");
  const note =
    input.notes === undefined ? "" : ` Reviewer note: ${input.notes}`;

  return `${action} ${variant.visualMode.toLowerCase().replaceAll("_", " ")} creative at ${variant.aspectRatio}; review signals: ${reasons}.${note}`;
}

function humanFeedbackEvidence(
  variant: GeneratedMediaVariant,
  input: CreativeFeedbackInput,
  scores: CreativeQualityScores,
): Prisma.InputJsonValue {
  return {
    aspectRatio: variant.aspectRatio,
    decision: input.decision,
    negativePrompt: variant.negativePrompt,
    notes: input.notes ?? null,
    prompt: variant.prompt,
    reasonCodes: input.reasonCodes,
    scores,
    visualMode: variant.visualMode,
  } as unknown as Prisma.InputJsonValue;
}

function humanizeReasonCode(code: CreativeFeedbackReasonCode): string {
  return code.toLowerCase().replaceAll("_", " ");
}

function aggregateContentPerformance(
  rows: InstagramAnalytics[],
): Map<string, { engagementRate: number; totals: PerformanceTotals }> {
  const grouped = new Map<string, InstagramAnalytics[]>();

  for (const row of rows) {
    if (row.contentItemId === null) {
      continue;
    }

    grouped.set(row.contentItemId, [
      ...(grouped.get(row.contentItemId) ?? []),
      row,
    ]);
  }

  return new Map(
    [...grouped.entries()].map(([contentItemId, contentRows]) => {
      const totals = emptyPerformanceTotals();

      for (const row of contentRows) {
        const metrics = toRecord(row.metrics);

        for (const key of Object.keys(totals) as Array<
          keyof PerformanceTotals
        >) {
          const value = metrics[key];

          if (typeof value === "number" && Number.isFinite(value)) {
            totals[key] = Math.max(totals[key], value);
          }
        }
      }

      if (totals.engagement === 0) {
        totals.engagement =
          totals.likes + totals.comments + totals.shares + totals.saves;
      }

      const denominator = Math.max(totals.reach, totals.impressions, 1);
      return [
        contentItemId,
        {
          engagementRate: totals.engagement / denominator,
          totals,
        },
      ];
    }),
  );
}

function emptyPerformanceTotals(): PerformanceTotals {
  return {
    comments: 0,
    engagement: 0,
    impressions: 0,
    likes: 0,
    reach: 0,
    saves: 0,
    shares: 0,
    views: 0,
  };
}

function classifyPerformance(
  engagementRate: number,
  baseline: number,
): CreativePatternType {
  return engagementRate >= baseline ? "POSITIVE" : "NEGATIVE";
}

function performanceConfidence(
  engagementRate: number,
  baseline: number,
): number {
  const distance =
    Math.abs(engagementRate - baseline) / Math.max(baseline, 0.0001);
  return Math.max(0.25, Math.min(1, 0.5 + distance / 2));
}

function performanceSummary(input: {
  caption: string | null;
  contentType: string;
  engagementRate: number;
  patternType: CreativePatternType;
  reach: number;
}): string {
  const action = input.patternType === "POSITIVE" ? "Reuse" : "Avoid";
  const caption =
    input.caption === null
      ? "without caption evidence"
      : `with caption pattern \"${truncate(input.caption, 140)}\"`;

  return `${action} ${input.contentType.toLowerCase()} creative ${caption}; ${(input.engagementRate * 100).toFixed(2)}% engagement rate from ${input.reach} reach.`;
}

function performanceEvidence(
  performance: { engagementRate: number; totals: PerformanceTotals },
  baseline: number,
  item: {
    campaignId: string | null;
    captionAr: string | null;
    captionEn: string | null;
    contentPillar: string | null;
    contentType: string;
    hashtags: string[];
  },
): Record<string, unknown> {
  return {
    baselineEngagementRate: baseline,
    campaignId: item.campaignId,
    captionAr: item.captionAr,
    captionEn: item.captionEn,
    contentPillar: item.contentPillar,
    contentType: item.contentType,
    engagementRate: performance.engagementRate,
    hashtags: item.hashtags,
    totals: performance.totals,
  };
}

function normalizedQualityScores(
  value: Record<string, number | undefined>,
): CreativeQualityScores {
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  ) as CreativeQualityScores;
}

async function persistExemplarsToVault(
  workspaceId: string,
  exemplars: CreativeLearningExemplar[],
): Promise<number> {
  if (exemplars.length === 0) {
    return 0;
  }

  const entries = exemplars.slice(0, 50).map((exemplar) => ({
    key: `${learningVaultPrefix}.${exemplar.patternKey}`.slice(0, 120),
    value: exemplarVaultValue(toCreativeLearningExemplarRecord(exemplar)),
  }));
  await upsertVaultSection(workspaceId, "OBJECTIVES", { entries });
  return entries.length;
}

async function syncExemplarsToVault(
  workspaceId: string,
  exemplars: CreativeLearningExemplar[],
): Promise<number> {
  if (exemplars.length === 0) {
    return 0;
  }

  const ids = exemplars.map((exemplar) => exemplar.id);

  try {
    const written = await persistExemplarsToVault(workspaceId, exemplars);
    await prisma.creativeLearningExemplar.updateMany({
      where: {
        workspaceId,
        id: { in: ids },
      },
      data: {
        vaultSyncedAt: new Date(),
        vaultSyncError: null,
      },
    });
    return written;
  } catch (error) {
    const message = truncate(
      error instanceof Error ? error.message : "Unknown Vault sync failure",
      500,
    );
    await prisma.creativeLearningExemplar.updateMany({
      where: {
        workspaceId,
        id: { in: ids },
      },
      data: {
        vaultSyncError: message,
      },
    });
    console.warn("Creative learning Vault sync deferred", {
      exemplarCount: ids.length,
      message,
      workspaceId,
    });
    return 0;
  }
}

function exemplarVaultValue(
  exemplar: CreativeLearningExemplarRecord,
): Record<string, unknown> {
  return {
    kind: "CREATIVE_LEARNING_EXEMPLAR",
    source: exemplar.source,
    patternType: exemplar.patternType,
    summary: exemplar.summary,
    evidence: exemplar.evidence,
    score: exemplar.score,
    contentItemId: exemplar.contentItemId ?? null,
    campaignId: exemplar.campaignId ?? null,
    generatedMediaVariantId: exemplar.generatedMediaVariantId ?? null,
    lastObservedAt: exemplar.lastObservedAt,
  };
}

function buildRecommendations(context: CreativeLearningContext): string[] {
  const recommendations = context.positive
    .slice(0, 2)
    .map((item) => `Repeat: ${item.summary}`);
  recommendations.push(
    ...context.negative.slice(0, 2).map((item) => `Avoid: ${item.summary}`),
  );

  return recommendations.length === 0
    ? [
        "Approve or reject generated assets and sync Instagram performance to start the creative learning loop.",
      ]
    : recommendations;
}

function toCreativeFeedbackRecord(
  feedback: CreativeFeedback,
): CreativeFeedbackRecord {
  return {
    id: feedback.id,
    workspaceId: feedback.workspaceId,
    generatedMediaVariantId: feedback.generatedMediaVariantId,
    ...(feedback.aiInteractionId === null
      ? {}
      : { aiInteractionId: feedback.aiInteractionId }),
    decision: feedback.decision,
    reasonCodes: feedback.reasonCodes as CreativeFeedbackReasonCode[],
    ...(feedback.notes === null ? {} : { notes: feedback.notes }),
    scores: toQualityScores(feedback.scores),
    ...(feedback.createdBy === null ? {} : { createdBy: feedback.createdBy }),
    createdAt: feedback.createdAt.toISOString(),
  };
}

function toCreativeLearningExemplarRecord(
  exemplar: CreativeLearningExemplar,
): CreativeLearningExemplarRecord {
  return {
    id: exemplar.id,
    workspaceId: exemplar.workspaceId,
    source: exemplar.source,
    patternType: exemplar.patternType,
    ...(exemplar.generatedMediaVariantId === null
      ? {}
      : { generatedMediaVariantId: exemplar.generatedMediaVariantId }),
    ...(exemplar.contentItemId === null
      ? {}
      : { contentItemId: exemplar.contentItemId }),
    ...(exemplar.campaignId === null
      ? {}
      : { campaignId: exemplar.campaignId }),
    ...(exemplar.aiInteractionId === null
      ? {}
      : { aiInteractionId: exemplar.aiInteractionId }),
    patternKey: exemplar.patternKey,
    summary: exemplar.summary,
    evidence: toRecord(exemplar.evidence),
    score: exemplar.score,
    active: exemplar.active,
    lastObservedAt: exemplar.lastObservedAt.toISOString(),
    ...(exemplar.vaultSyncedAt === null
      ? {}
      : { vaultSyncedAt: exemplar.vaultSyncedAt.toISOString() }),
    ...(exemplar.vaultSyncError === null
      ? {}
      : { vaultSyncError: exemplar.vaultSyncError }),
    createdAt: exemplar.createdAt.toISOString(),
    updatedAt: exemplar.updatedAt.toISOString(),
  };
}

function toQualityScores(value: Prisma.JsonValue): CreativeQualityScores {
  const record = toRecord(value);
  const scores: CreativeQualityScores = {};

  for (const key of [
    "brandAlignment",
    "composition",
    "overall",
    "platformReadiness",
    "productAccuracy",
  ] as const) {
    const score = record[key];

    if (typeof score === "number" && Number.isFinite(score)) {
      scores[key] = Math.max(0, Math.min(100, score));
    }
  }

  return scores;
}

function toRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
