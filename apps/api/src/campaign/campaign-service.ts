import type {
  Campaign,
  ContentItem,
  ContentStatus,
  ContentType,
  Prisma,
} from "@prisma/client";
import type {
  CampaignBrief,
  CampaignPackage,
  CampaignPackageItem,
  CampaignPackageRecord,
  CampaignRecord,
  CampaignRejectedIdea,
  ContentRecord,
  VaultRagChunk,
} from "@markos/shared-types";
import type {
  CampaignBriefInput,
  CampaignPackageListQueryInput,
  GenerateCampaignPackageInput,
  RejectCampaignItemInput,
  ScheduleCampaignPackageInput,
} from "@markos/validation";
import { campaignPackageSchema } from "@markos/validation";
import { listCatalogGenerationContext } from "../catalog/catalog-service";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import {
  getCreativeLearningVaultChunks,
  recordCampaignRejectionLearning,
} from "../learning/creative-learning-service";
import {
  generateWorkspaceContent,
  toContentRecord,
} from "../content/content-service";
import { getVaultScore, searchVaultContext } from "../vault/vault-service";

const strategistAgentName = "MARKETING_STRATEGIST";
const localCurrency = "BHD";
const defaultCampaignTime = "19:30";

export class CampaignContextMissingError extends Error {
  constructor() {
    super(
      "Complete at least one Vault section before generating a campaign package",
    );
  }
}

export class CampaignNotFoundError extends Error {
  constructor() {
    super("Campaign was not found");
  }
}

export class CampaignItemNotFoundError extends Error {
  constructor() {
    super("Campaign content item was not found");
  }
}

export class CampaignStateError extends Error {
  constructor(message = "Campaign cannot move to that state") {
    super(message);
  }
}

export async function listCampaignPackages(
  workspaceId: string,
  input: CampaignPackageListQueryInput,
): Promise<CampaignPackageRecord[]> {
  const campaigns = await prisma.campaign.findMany({
    where: {
      workspaceId,
      deletedAt: null,
      ...(input.status === undefined ? {} : { status: input.status }),
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: input.limit,
  });

  return Promise.all(
    campaigns.map((campaign) => toCampaignPackageRecord(campaign)),
  );
}

export async function generateCampaignPackage(
  workspaceId: string,
  input: GenerateCampaignPackageInput,
): Promise<CampaignPackageRecord> {
  const score = await getVaultScore(workspaceId);

  if (score.entryCount === 0) {
    throw new CampaignContextMissingError();
  }

  const brief = normalizeBrief(input.brief);
  const [retrievedVaultContext, catalogContext, creativeLearningContext] =
    await Promise.all([
      searchVaultContext(workspaceId, {
        query: `${brief.objective} ${brief.audience ?? ""} ${brief.tone ?? ""}`,
        topK: 10,
      }),
      listCatalogGenerationContext(workspaceId, {
        limit: 8,
        ...(brief.offerId === undefined ? {} : { offerId: brief.offerId }),
        ...(brief.productId === undefined
          ? {}
          : { productId: brief.productId }),
      }),
      getCreativeLearningVaultChunks(workspaceId),
    ]);
  const vaultContext = [
    ...creativeLearningContext,
    ...retrievedVaultContext,
  ].slice(0, 16);
  const campaign = await prisma.campaign.create({
    data: {
      workspaceId,
      name: input.name?.trim() || titleFromBrief(brief),
      objective: brief.objective,
      status: "DRAFT",
      structuredBrief: brief as unknown as Prisma.InputJsonValue,
      ...(brief.productId === undefined ? {} : { productId: brief.productId }),
      ...(brief.offerId === undefined ? {} : { offerId: brief.offerId }),
      startsAt: campaignStartDate(brief.startDate),
    },
  });

  try {
    const plan = buildCampaignPlan(brief, catalogContext, vaultContext);
    const contentItems: ContentRecord[] = [];

    for (const item of plan) {
      const [record] = await generateWorkspaceContent(
        workspaceId,
        {
          contentType: item.contentType,
          count: 1,
          topic: buildContentTopic(brief, item, catalogContext, vaultContext),
          ...(brief.productId === undefined
            ? {}
            : { productId: brief.productId }),
          ...(brief.offerId === undefined ? {} : { offerId: brief.offerId }),
        },
        {
          campaignId: campaign.id,
        },
      );

      if (record) {
        contentItems.push(record);
      }
    }

    if (contentItems.length === 0) {
      throw new CampaignStateError(
        "Campaign generation returned no content items",
      );
    }

    const generatedPackage = validateCampaignPackage(
      buildCampaignPackage(
        brief,
        contentItems,
        plan,
        catalogContext,
        vaultContext,
      ),
    );
    const generatedAt = new Date();
    const startsAt = firstScheduleDate(generatedPackage) ?? campaign.startsAt;
    const endsAt = lastScheduleDate(generatedPackage);
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.campaign.update({
        where: {
          id: campaign.id,
        },
        data: {
          status: "GENERATED",
          package: generatedPackage as unknown as Prisma.InputJsonValue,
          rationale: generatedPackage.rationale,
          generatedAt,
          startsAt,
          ...(endsAt === undefined ? {} : { endsAt }),
        },
      });

      await tx.aiInteraction.create({
        data: {
          workspaceId,
          agent: strategistAgentName,
          promptVersion: "campaign-workbench.v1",
          prompt: {
            brief,
            catalogContext,
            vaultContext: vaultContext.map((chunk) => ({
              section: chunk.section,
              key: chunk.key,
              score: chunk.score,
            })),
          } as unknown as Prisma.InputJsonValue,
          response: generatedPackage as unknown as Prisma.InputJsonValue,
          tokensIn: 0,
          tokensOut: 0,
          costMinor: 0,
          currency: localCurrency,
          model: env.LLM_PRIMARY_MODEL,
        },
      });

      return row;
    });

    return toCampaignPackageRecord(updated, contentItems);
  } catch (error) {
    await prisma.campaign.update({
      where: {
        id: campaign.id,
      },
      data: {
        status: "ARCHIVED",
        rationale:
          error instanceof Error ? error.message : "Campaign generation failed",
      },
    });
    throw error;
  }
}

export async function approveCampaignPackage(
  workspaceId: string,
  campaignId: string,
): Promise<CampaignPackageRecord> {
  const campaign = await findCampaign(workspaceId, campaignId);

  if (campaign.status === "SCHEDULED") {
    throw new CampaignStateError("Scheduled campaigns cannot be re-approved");
  }

  if (campaign.status === "ARCHIVED") {
    throw new CampaignStateError("Archived campaigns cannot be approved");
  }

  const contentItems = await listCampaignContentItems(workspaceId, campaign.id);

  if (contentItems.length === 0) {
    throw new CampaignStateError("Campaign has no content items to approve");
  }

  const invalidItem = contentItems.find(
    (item) => !["DRAFT", "IN_REVIEW", "APPROVED"].includes(item.status),
  );

  if (invalidItem) {
    throw new CampaignStateError(
      `Content item ${invalidItem.id} is already ${invalidItem.status.toLowerCase()}`,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.contentItem.updateMany({
      where: {
        workspaceId,
        campaignId: campaign.id,
        status: "DRAFT",
        deletedAt: null,
      },
      data: {
        status: "IN_REVIEW",
      },
    });
    await tx.contentItem.updateMany({
      where: {
        workspaceId,
        campaignId: campaign.id,
        status: "IN_REVIEW",
        deletedAt: null,
      },
      data: {
        status: "APPROVED",
      },
    });

    return tx.campaign.update({
      where: {
        id: campaign.id,
      },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
      },
    });
  });

  return toCampaignPackageRecord(updated);
}

export async function rejectCampaignItem(
  workspaceId: string,
  campaignId: string,
  contentItemId: string,
  input: RejectCampaignItemInput,
): Promise<CampaignPackageRecord> {
  const campaign = await findCampaign(workspaceId, campaignId);

  if (["SCHEDULED", "ARCHIVED"].includes(campaign.status)) {
    throw new CampaignStateError(
      "Scheduled or archived campaigns cannot accept item feedback",
    );
  }

  const item = await prisma.contentItem.findFirst({
    where: {
      id: contentItemId,
      workspaceId,
      campaignId: campaign.id,
      deletedAt: null,
    },
  });

  if (!item) {
    throw new CampaignItemNotFoundError();
  }

  const rejectedIdeas = parseRejectedIdeas(campaign.rejectedIdeas);
  const feedback: CampaignRejectedIdea = {
    contentItemId: item.id,
    reason: input.reason.trim(),
    rejectedAt: new Date().toISOString(),
    snapshot: {
      captionEn: item.captionEn,
      captionAr: item.captionAr,
      contentPillar: item.contentPillar,
      contentType: item.contentType,
      hashtags: item.hashtags,
      status: item.status,
    },
  };

  const updated = await prisma.$transaction(async (tx) => {
    if (item.status === "APPROVED") {
      await tx.contentItem.update({
        where: {
          id: item.id,
        },
        data: {
          status: "DRAFT",
        },
      });
    }

    return tx.campaign.update({
      where: {
        id: campaign.id,
      },
      data: {
        status: "IN_REVIEW",
        rejectedIdeas: [
          ...rejectedIdeas,
          feedback,
        ] as unknown as Prisma.InputJsonValue,
      },
    });
  });

  await recordCampaignRejectionLearning({
    workspaceId,
    campaignId: campaign.id,
    contentItemId: item.id,
    reason: feedback.reason,
    snapshot: feedback.snapshot as unknown as Record<string, unknown>,
    now: new Date(feedback.rejectedAt),
  });

  return toCampaignPackageRecord(updated);
}

export async function scheduleCampaignPackage(
  workspaceId: string,
  campaignId: string,
  input: ScheduleCampaignPackageInput,
): Promise<CampaignPackageRecord> {
  const campaign = await findCampaign(workspaceId, campaignId);

  if (campaign.status === "SCHEDULED") {
    return toCampaignPackageRecord(campaign);
  }

  if (campaign.status !== "APPROVED") {
    throw new CampaignStateError(
      "Approve the campaign package before scheduling it",
    );
  }

  const contentItems = await listCampaignContentItems(workspaceId, campaign.id);

  if (contentItems.length === 0) {
    throw new CampaignStateError("Campaign has no content items to schedule");
  }

  const invalidItem = contentItems.find((item) => item.status !== "APPROVED");

  if (invalidItem) {
    throw new CampaignStateError(
      `Content item ${invalidItem.id} must be approved before scheduling`,
    );
  }

  const campaignPackage = parseCampaignPackage(campaign.package);
  const schedule = buildScheduleForItems(contentItems, campaignPackage, input);
  const startsAt = schedule[0]?.scheduledAt;
  const endsAt = schedule[schedule.length - 1]?.scheduledAt;

  const updated = await prisma.$transaction(async (tx) => {
    for (const entry of schedule) {
      const updatedItem = await tx.contentItem.update({
        where: {
          id: entry.contentItemId,
        },
        data: {
          scheduledAt: entry.scheduledAt,
          status: "SCHEDULED",
        },
      });

      await addToContentCalendar(
        tx,
        workspaceId,
        updatedItem.id,
        entry.scheduledAt,
      );
    }

    return tx.campaign.update({
      where: {
        id: campaign.id,
      },
      data: {
        status: "SCHEDULED",
        ...(startsAt === undefined ? {} : { startsAt }),
        ...(endsAt === undefined ? {} : { endsAt }),
      },
    });
  });

  return toCampaignPackageRecord(updated);
}

async function findCampaign(
  workspaceId: string,
  campaignId: string,
): Promise<Campaign> {
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      workspaceId,
      deletedAt: null,
    },
  });

  if (!campaign) {
    throw new CampaignNotFoundError();
  }

  return campaign;
}

async function listCampaignContentItems(
  workspaceId: string,
  campaignId: string,
): Promise<ContentItem[]> {
  return prisma.contentItem.findMany({
    where: {
      workspaceId,
      campaignId,
      deletedAt: null,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

async function toCampaignPackageRecord(
  campaign: Campaign,
  contentRecords?: ContentRecord[],
): Promise<CampaignPackageRecord> {
  const contentItems =
    contentRecords ??
    (await listCampaignContentItems(campaign.workspaceId, campaign.id)).map(
      (item) => toContentRecord(item),
    );

  return {
    campaign: toCampaignRecord(campaign, contentItems),
    contentItems,
  };
}

function toCampaignRecord(
  campaign: Campaign,
  contentItems: ContentRecord[],
): CampaignRecord {
  const contentById = new Map(contentItems.map((item) => [item.id, item]));
  const campaignPackage = parseCampaignPackage(campaign.package);

  return {
    id: campaign.id,
    workspaceId: campaign.workspaceId,
    name: campaign.name,
    ...(campaign.objective === null ? {} : { objective: campaign.objective }),
    status: campaign.status,
    structuredBrief: parseCampaignBrief(campaign.structuredBrief),
    ...(campaignPackage === undefined
      ? {}
      : { package: syncPackageStatuses(campaignPackage, contentById) }),
    ...(campaign.productId === null ? {} : { productId: campaign.productId }),
    ...(campaign.offerId === null ? {} : { offerId: campaign.offerId }),
    ...(campaign.rationale === null ? {} : { rationale: campaign.rationale }),
    rejectedIdeas: parseRejectedIdeas(campaign.rejectedIdeas),
    ...(campaign.startsAt === null
      ? {}
      : { startsAt: campaign.startsAt.toISOString() }),
    ...(campaign.endsAt === null
      ? {}
      : { endsAt: campaign.endsAt.toISOString() }),
    ...(campaign.generatedAt === null
      ? {}
      : { generatedAt: campaign.generatedAt.toISOString() }),
    ...(campaign.approvedAt === null
      ? {}
      : { approvedAt: campaign.approvedAt.toISOString() }),
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

function normalizeBrief(brief: CampaignBriefInput): CampaignBrief {
  const audience = cleanOptionalString(brief.audience);
  const tone = cleanOptionalString(brief.tone);

  return {
    contentCount: Math.max(1, Math.min(8, brief.contentCount)),
    contentTypes: uniqueContentTypes(brief.contentTypes),
    durationDays: Math.max(1, Math.min(30, brief.durationDays)),
    objective: brief.objective.trim(),
    ...(audience === undefined ? {} : { audience }),
    ...(brief.offerId === undefined ? {} : { offerId: brief.offerId }),
    ...(brief.productId === undefined ? {} : { productId: brief.productId }),
    ...(brief.startDate === undefined ? {} : { startDate: brief.startDate }),
    ...(tone === undefined ? {} : { tone }),
  };
}

function buildCampaignPlan(
  brief: CampaignBrief,
  catalogContext: VaultRagChunk[],
  vaultContext: VaultRagChunk[],
): Array<{ angle: string; contentType: ContentType; day: number }> {
  const angles = buildCampaignAngles(brief, catalogContext, vaultContext);

  return Array.from({ length: brief.contentCount }, (_, index) => ({
    angle: angles[index % angles.length] ?? brief.objective,
    contentType:
      brief.contentTypes[index % brief.contentTypes.length] ?? "POST",
    day: spreadDay(index, brief.contentCount, brief.durationDays),
  }));
}

function buildCampaignPackage(
  brief: CampaignBrief,
  contentItems: ContentRecord[],
  plan: Array<{ angle: string; contentType: ContentType; day: number }>,
  catalogContext: VaultRagChunk[],
  vaultContext: VaultRagChunk[],
): CampaignPackage {
  const angles = buildCampaignAngles(brief, catalogContext, vaultContext);
  const schedule = contentItems.map((item, index) => {
    const planItem = plan[index] ?? plan[0];
    const scheduledAt = dateAtCampaignTime(
      campaignStartDate(brief.startDate),
      planItem?.day ?? index + 1,
      defaultCampaignTime,
    );

    return {
      contentItemId: item.id,
      day: planItem?.day ?? index + 1,
      scheduledAt: scheduledAt.toISOString(),
    };
  });
  const items: CampaignPackageItem[] = contentItems.map((item, index) => {
    const planItem = plan[index] ?? plan[0];
    const proposed = schedule[index];

    return {
      contentItemId: item.id,
      contentType: item.contentType,
      day: proposed?.day ?? planItem?.day ?? index + 1,
      angle: planItem?.angle ?? brief.objective,
      ...(proposed === undefined ? {} : { scheduledAt: proposed.scheduledAt }),
      status: item.status,
    };
  });

  return {
    angles,
    items,
    objectives: buildCampaignObjectives(brief, catalogContext),
    rationale: buildRationale(brief, catalogContext, vaultContext),
    schedule,
  };
}

function validateCampaignPackage(
  campaignPackage: CampaignPackage,
): CampaignPackage {
  const parsed = campaignPackageSchema.safeParse(campaignPackage);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "package"}: ${issue.message}`)
      .join("; ");
    throw new CampaignStateError(
      `Campaign package validation failed: ${issues}`,
    );
  }

  return parsed.data as CampaignPackage;
}

function buildCampaignAngles(
  brief: CampaignBrief,
  catalogContext: VaultRagChunk[],
  vaultContext: VaultRagChunk[],
): string[] {
  const selectedOffer = findCatalogChunk(catalogContext, "offer", true);
  const selectedProduct =
    findCatalogChunk(catalogContext, "product", true) ??
    findCatalogChunk(catalogContext, "product", false);
  const productName =
    stringValue(selectedProduct?.value.name) ?? "the priority offer";
  const offerTitle = stringValue(selectedOffer?.value.title);
  const benefits = stringArrayValue(selectedProduct?.value.benefits).slice(
    0,
    3,
  );
  const audience =
    brief.audience ??
    firstVaultSignal(vaultContext, "AUDIENCE") ??
    "your highest-fit Instagram audience";
  const angles: string[] = [];

  if (offerTitle !== undefined) {
    angles.push(`Lead with "${offerTitle}" and make the next action obvious.`);
  }

  for (const benefit of benefits) {
    angles.push(`Connect ${productName} to ${audience} through ${benefit}.`);
  }

  angles.push(`Frame ${productName} around ${brief.objective}.`);
  angles.push(
    `Turn the campaign into a short proof-led sequence for ${audience}.`,
  );

  if (brief.tone !== undefined) {
    angles.push(`Keep the creative voice ${brief.tone} across every asset.`);
  }

  return uniqueStrings(angles).slice(0, 6);
}

function buildContentTopic(
  brief: CampaignBrief,
  item: { angle: string; contentType: ContentType; day: number },
  catalogContext: VaultRagChunk[],
  vaultContext: VaultRagChunk[],
): string {
  const selectedProduct =
    findCatalogChunk(catalogContext, "product", true) ??
    findCatalogChunk(catalogContext, "product", false);
  const selectedOffer = findCatalogChunk(catalogContext, "offer", true);
  const parts = [
    `Campaign objective: ${brief.objective}`,
    `Asset format: ${item.contentType}`,
    `Campaign day: ${item.day}`,
    `Angle: ${item.angle}`,
    brief.audience === undefined ? undefined : `Audience: ${brief.audience}`,
    brief.tone === undefined ? undefined : `Tone: ${brief.tone}`,
    selectedProduct === undefined
      ? undefined
      : `Product: ${stringValue(selectedProduct.value.name) ?? "selected product"}`,
    selectedOffer === undefined
      ? undefined
      : `Offer: ${stringValue(selectedOffer.value.title) ?? "selected offer"}`,
    firstVaultSignal(vaultContext, "BRAND") === undefined
      ? undefined
      : `Brand fact: ${firstVaultSignal(vaultContext, "BRAND")}`,
  ];

  return parts
    .filter((part): part is string => typeof part === "string")
    .join("\n");
}

function buildCampaignObjectives(
  brief: CampaignBrief,
  catalogContext: VaultRagChunk[],
): Array<{ label: string; value: string }> {
  const selectedOffer = findCatalogChunk(catalogContext, "offer", true);
  const priceMinor = numberValue(selectedOffer?.value.priceMinor);

  return [
    {
      label: "Content",
      value: `${brief.contentCount} assets`,
    },
    {
      label: "Window",
      value: `${brief.durationDays} days`,
    },
    {
      label: priceMinor === undefined ? "Objective" : "Revenue context",
      value:
        priceMinor === undefined
          ? "Campaign-ready"
          : `${formatBhd(priceMinor)} offer`,
    },
  ];
}

function buildRationale(
  brief: CampaignBrief,
  catalogContext: VaultRagChunk[],
  vaultContext: VaultRagChunk[],
): string {
  const productName =
    stringValue(
      findCatalogChunk(catalogContext, "product", true)?.value.name,
    ) ??
    stringValue(
      findCatalogChunk(catalogContext, "product", false)?.value.name,
    ) ??
    "the selected business priority";
  const audience =
    brief.audience ??
    firstVaultSignal(vaultContext, "AUDIENCE") ??
    "the priority audience";

  return `MARKOS built a ${brief.durationDays}-day, ${brief.contentCount}-asset campaign around ${productName}, ${audience}, and the approved Vault context.`;
}

function buildScheduleForItems(
  contentItems: ContentItem[],
  campaignPackage: CampaignPackage | undefined,
  input: ScheduleCampaignPackageInput,
): Array<{ contentItemId: string; scheduledAt: Date }> {
  const packageSchedule = new Map(
    (campaignPackage?.schedule ?? []).map((entry) => [
      entry.contentItemId,
      entry,
    ]),
  );
  const base =
    input.startDate === undefined ? undefined : parseDate(input.startDate);

  return contentItems.map((item, index) => {
    const packageEntry = packageSchedule.get(item.id);
    const proposed =
      input.startDate === undefined && packageEntry?.scheduledAt !== undefined
        ? parseDate(packageEntry.scheduledAt)
        : undefined;
    const day = packageEntry?.day ?? index + 1;
    const scheduledAt =
      proposed !== undefined && proposed > new Date()
        ? proposed
        : dateAtCampaignTime(base ?? tomorrow(), day, input.time);

    if (scheduledAt <= new Date()) {
      throw new CampaignStateError("Campaign schedule must be in the future");
    }

    return {
      contentItemId: item.id,
      scheduledAt,
    };
  });
}

function syncPackageStatuses(
  campaignPackage: CampaignPackage,
  contentById: Map<string, ContentRecord>,
): CampaignPackage {
  return {
    ...campaignPackage,
    items: campaignPackage.items.map((item) => {
      const content = contentById.get(item.contentItemId);

      if (content === undefined) {
        return item;
      }

      return {
        ...item,
        status: content.status,
        ...(content.scheduledAt === undefined
          ? {}
          : { scheduledAt: content.scheduledAt }),
      };
    }),
    schedule: campaignPackage.schedule.map((entry) => {
      const content = contentById.get(entry.contentItemId);

      return {
        ...entry,
        scheduledAt: content?.scheduledAt ?? entry.scheduledAt,
      };
    }),
  };
}

function parseCampaignPackage(
  value: Prisma.JsonValue | null,
): CampaignPackage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const itemRecords = recordArray(value.items);
  const scheduleRecords = recordArray(value.schedule);
  const objectiveRecords = recordArray(value.objectives);
  const items = itemRecords.map((item) => {
    const scheduledAt = stringValue(item.scheduledAt);

    return {
      contentItemId: stringValue(item.contentItemId) ?? "",
      contentType: contentTypeValue(item.contentType),
      day: numberValue(item.day) ?? 1,
      angle: stringValue(item.angle) ?? "",
      ...(scheduledAt === undefined ? {} : { scheduledAt }),
      status: contentStatusValue(item.status),
    };
  });
  const schedule = scheduleRecords.map((entry) => ({
    contentItemId: stringValue(entry.contentItemId) ?? "",
    day: numberValue(entry.day) ?? 1,
    scheduledAt: stringValue(entry.scheduledAt) ?? new Date().toISOString(),
  }));
  const objectives = objectiveRecords.map((entry) => ({
    label: stringValue(entry.label) ?? "",
    value: stringValue(entry.value) ?? "",
  }));

  return {
    angles: stringArrayValue(value.angles),
    items: items.filter((item) => item.contentItemId.length > 0),
    objectives: objectives.filter((item) => item.label.length > 0),
    rationale: stringValue(value.rationale) ?? "",
    schedule: schedule.filter((item) => item.contentItemId.length > 0),
  };
}

function parseCampaignBrief(value: Prisma.JsonValue): CampaignBrief {
  if (!isRecord(value)) {
    return {
      contentCount: 1,
      contentTypes: ["POST"],
      durationDays: 7,
      objective: "Campaign",
    };
  }

  const audience = stringValue(value.audience);
  const offerId = stringValue(value.offerId);
  const productId = stringValue(value.productId);
  const startDate = stringValue(value.startDate);
  const tone = stringValue(value.tone);

  return {
    contentCount: numberValue(value.contentCount) ?? 1,
    contentTypes: Array.isArray(value.contentTypes)
      ? uniqueContentTypes(value.contentTypes)
      : ["POST"],
    durationDays: numberValue(value.durationDays) ?? 7,
    objective: stringValue(value.objective) ?? "Campaign",
    ...(audience === undefined ? {} : { audience }),
    ...(offerId === undefined ? {} : { offerId }),
    ...(productId === undefined ? {} : { productId }),
    ...(startDate === undefined ? {} : { startDate }),
    ...(tone === undefined ? {} : { tone }),
  };
}

function parseRejectedIdeas(value: Prisma.JsonValue): CampaignRejectedIdea[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return (value as unknown[]).filter(isRecord).map((item) => {
    const contentItemId = stringValue(item.contentItemId);

    return {
      ...(contentItemId === undefined ? {} : { contentItemId }),
      reason: stringValue(item.reason) ?? "Rejected",
      rejectedAt: stringValue(item.rejectedAt) ?? new Date().toISOString(),
      ...(isRecord(item.snapshot) ? { snapshot: item.snapshot } : {}),
    };
  });
}

function addToContentCalendar(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  contentItemId: string,
  scheduledAt: Date,
): Promise<void> {
  return upsertCalendarPlan(tx, workspaceId, contentItemId, scheduledAt);
}

async function upsertCalendarPlan(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  contentItemId: string,
  scheduledAt: Date,
): Promise<void> {
  const month = monthStart(scheduledAt);
  const current = await tx.contentCalendar.findFirst({
    where: {
      workspaceId,
      month,
      deletedAt: null,
    },
  });
  const plan = mergeCalendarPlan(current?.plan, contentItemId);

  if (current) {
    await tx.contentCalendar.update({
      where: {
        id: current.id,
      },
      data: {
        plan: plan as unknown as Prisma.InputJsonValue,
      },
    });
    return;
  }

  await tx.contentCalendar.create({
    data: {
      workspaceId,
      month,
      plan: plan as unknown as Prisma.InputJsonValue,
    },
  });
}

function mergeCalendarPlan(
  value: Prisma.JsonValue | undefined,
  contentItemId: string,
): { scheduledContentIds: string[] } {
  const current =
    isRecord(value) && Array.isArray(value.scheduledContentIds)
      ? value.scheduledContentIds.filter(
          (id): id is string => typeof id === "string",
        )
      : [];

  return {
    scheduledContentIds: Array.from(new Set([...current, contentItemId])),
  };
}

function campaignStartDate(value: string | undefined): Date {
  const requested = value === undefined ? undefined : parseDate(value);
  const minStart = tomorrow();

  if (requested !== undefined && requested > new Date()) {
    return requested;
  }

  return minStart;
}

function dateAtCampaignTime(base: Date, day: number, time: string): Date {
  const [hour = 19, minute = 30] = time.split(":").map((part) => Number(part));
  const scheduledAt = new Date(base);

  scheduledAt.setDate(scheduledAt.getDate() + Math.max(0, day - 1));
  scheduledAt.setHours(hour, minute, 0, 0);

  if (scheduledAt <= new Date()) {
    scheduledAt.setDate(scheduledAt.getDate() + 1);
  }

  return scheduledAt;
}

function parseDate(value: string): Date {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new CampaignStateError("Campaign date is invalid");
  }

  return date;
}

function tomorrow(): Date {
  const date = new Date();

  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);

  return date;
}

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function firstScheduleDate(campaignPackage: CampaignPackage): Date | undefined {
  return dateBounds(campaignPackage)[0];
}

function lastScheduleDate(campaignPackage: CampaignPackage): Date | undefined {
  return dateBounds(campaignPackage)[1];
}

function dateBounds(
  campaignPackage: CampaignPackage,
): [Date | undefined, Date | undefined] {
  const dates = campaignPackage.schedule
    .map((entry) => parseDate(entry.scheduledAt))
    .sort((a, b) => a.getTime() - b.getTime());

  return [dates[0], dates[dates.length - 1]];
}

function spreadDay(index: number, count: number, durationDays: number): number {
  if (count <= 1) {
    return 1;
  }

  return Math.min(durationDays, Math.floor((index * durationDays) / count) + 1);
}

function findCatalogChunk(
  catalogContext: VaultRagChunk[],
  sourceType: "offer" | "product",
  selected: boolean,
): VaultRagChunk | undefined {
  return catalogContext.find(
    (chunk) =>
      chunk.value.sourceType === sourceType &&
      Boolean(chunk.value.selectedForGeneration) === selected,
  );
}

function firstVaultSignal(
  vaultContext: VaultRagChunk[],
  section: string,
): string | undefined {
  const chunk = vaultContext.find((item) => item.section === section);

  if (chunk === undefined) {
    return undefined;
  }

  return flattenStrings(chunk.value)[0];
}

function flattenStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim().length > 0 ? [value.trim()] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenStrings);
  }

  if (isRecord(value)) {
    return Object.values(value).flatMap(flattenStrings);
  }

  return [];
}

function uniqueContentTypes(values: unknown[]): ContentType[] {
  const filtered = values.filter((value): value is ContentType =>
    contentTypes.includes(value as ContentType),
  );
  const unique = Array.from(new Set(filtered));

  return unique.length === 0 ? ["POST"] : unique;
}

function contentTypeValue(value: unknown): ContentType {
  return contentTypes.includes(value as ContentType)
    ? (value as ContentType)
    : "POST";
}

function contentStatusValue(value: unknown): ContentStatus {
  return contentStatuses.includes(value as ContentStatus)
    ? (value as ContentStatus)
    : "DRAFT";
}

function cleanOptionalString(value: string | undefined): string | undefined {
  const clean = value?.trim();

  return clean === undefined || clean.length === 0 ? undefined : clean;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? uniqueStrings(
        value.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        ),
      )
    : [];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function formatBhd(priceMinor: number): string {
  return `BD ${(priceMinor / 1000).toFixed(3)}`;
}

function titleFromBrief(brief: CampaignBrief): string {
  const words = brief.objective
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 8)
    .join(" ");

  return words.length === 0 ? "Campaign package" : words;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as unknown[]).filter(isRecord) : [];
}

const contentTypes: ContentType[] = ["POST", "CAROUSEL", "STORY", "REEL"];
const contentStatuses: ContentStatus[] = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "FAILED",
];
