import type { Prisma } from "@prisma/client";
import type { BusinessProfile, OnboardingBusinessProfileState, VaultRagChunk } from "@markos/shared-types";
import { businessProfileSchema, type ApproveBusinessProfileInput } from "@markos/validation";
import { generateBusinessProfile as requestBusinessProfile } from "../ai/business-profile-client";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { recordAiTokenUsage, refundWorkspaceUsage, reserveWorkspaceUsage } from "../usage/usage-service";
import { getVaultScore, listVault, indexVaultEntries, lockWorkspaceKnowledge, persistVaultSection } from "../vault/vault-service";

import { readStoredKnowledge, persistKnowledge, currentProfileSummary } from "../business-profile/knowledge-service";
import { getOfferingCatalog } from "../offerings/offering-catalog-service";

export const businessProfileAgentName = "ONBOARDING_PROFILE_RESOLVER";
const localCurrency = "BHD";

export class BusinessProfileContextIncompleteError extends Error {
  constructor() {
    super("Add the business name and products or services before generating the business profile");
  }
}

export class BusinessProfileNotFoundError extends Error {
  constructor() {
    super("The business profile draft was not found");
  }
}

export class BusinessProfileAlreadyApprovedError extends Error {
  constructor() {
    super("This business profile has already been approved");
  }
}

export async function getBusinessProfileState(workspaceId: string): Promise<OnboardingBusinessProfileState> {
  const { stored, updatedAt } = await readStoredKnowledge(prisma, workspaceId);
  if (stored.approved) {
    const catalog = await getOfferingCatalog(workspaceId);
    return {
      status: "APPROVED",
      interactionId: stored.interactionId ?? null,
      profile: stored.summaryCurrent && stored.introduction ? stored.introduction : currentProfileSummary(stored, catalog),
      updatedAt
    };
  }
  const row = await prisma.aiInteraction.findFirst({
    where: {
      workspaceId,
      agent: businessProfileAgentName,
      deletedAt: null,
      OR: [{ regenerated: null }, { regenerated: false }]
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (row === null) {
    return emptyBusinessProfileState();
  }

  const response = readRecord(row.response);
  const profile = businessProfileSchema.safeParse(row.accepted === true ? response?.approvedProfile : response?.generatedProfile);

  if (!profile.success) {
    return emptyBusinessProfileState();
  }

  return {
    status: row.accepted === true ? "APPROVED" : "DRAFT",
    interactionId: row.id,
    profile: profile.data,
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function generateWorkspaceBusinessProfile(workspaceId: string): Promise<void> {
  const score = await getVaultScore(workspaceId);

  if (!score.completedSections.includes("COMPANY") || !score.completedSections.includes("PRODUCTS")) {
    throw new BusinessProfileContextIncompleteError();
  }

  const context = await onboardingContext(workspaceId);
  const usagePeriodDate = new Date();
  await reserveWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usagePeriodDate });

  try {
    const generated = await requestBusinessProfile({ workspaceId, context });

    await prisma.$transaction(async (tx) => {
      await tx.aiInteraction.updateMany({
        where: {
          workspaceId,
          agent: businessProfileAgentName,
          deletedAt: null,
          OR: [{ regenerated: null }, { regenerated: false }]
        },
        data: {
          regenerated: true
        }
      });

      await tx.aiInteraction.create({
        data: {
          workspaceId,
          agent: businessProfileAgentName,
          promptVersion: generated.prompt_version,
          prompt: {
            workflow: "onboarding-business-profile",
            retrievedContext: context
          } as unknown as Prisma.InputJsonValue,
          response: {
            generatedProfile: generated.profile,
            providerPromptVersion: generated.prompt_version
          } as unknown as Prisma.InputJsonValue,
          accepted: false,
          edited: false,
          regenerated: false,
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
  } catch (error) {
    await refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usagePeriodDate });
    throw error;
  }
}

export async function approveWorkspaceBusinessProfile(workspaceId: string, input: ApproveBusinessProfileInput): Promise<void> {
  const interaction = await prisma.aiInteraction.findFirst({
    where: {
      id: input.interactionId,
      workspaceId,
      agent: businessProfileAgentName,
      deletedAt: null,
      OR: [{ regenerated: null }, { regenerated: false }]
    }
  });

  if (interaction === null) {
    throw new BusinessProfileNotFoundError();
  }

  if (interaction.accepted === true) {
    throw new BusinessProfileAlreadyApprovedError();
  }

  const response = readRecord(interaction.response);
  const generated = businessProfileSchema.safeParse(response?.generatedProfile);

  if (!generated.success) {
    throw new BusinessProfileNotFoundError();
  }

  const approvedProfile: BusinessProfile = input.profile;
  const edited = JSON.stringify(generated.data) !== JSON.stringify(approvedProfile);
  const vaultScore = await getVaultScore(workspaceId);

  const entries = await prisma.$transaction(async (tx) => {
    await lockWorkspaceKnowledge(tx, workspaceId);
    const current = await tx.aiInteraction.findFirst({ where: { id: interaction.id, workspaceId, deletedAt: null, regenerated: false, accepted: false } });
    if (!current) throw new BusinessProfileNotFoundError();
    const { stored } = await readStoredKnowledge(tx, workspaceId);
    stored.approved = true;
    stored.introduction = approvedProfile;
    stored.interactionId = interaction.id;
    stored.summaryCurrent = true;
    stored.modules.company.name = approvedProfile.businessName;
    await persistKnowledge(tx, workspaceId, stored);
    const projected = await persistVaultSection(tx, workspaceId, "COMPANY", {
      entries: [
        { key: "profile", value: stored.modules.company },
        { key: "business-profile", value: { ...approvedProfile, approvedAt: new Date().toISOString() } }
      ]
    });
    await tx.aiInteraction.update({
      where: { id: interaction.id },
      data: { accepted: true, edited, response: { ...response, generatedProfile: generated.data, approvedProfile } as unknown as Prisma.InputJsonValue }
    });
    await tx.workspace.update({ where: { id: workspaceId }, data: { onboardingStatus: "COMPLETE", onboardingScore: vaultScore.score } });
    return projected;
  });
  await indexVaultEntries(entries);
}

export async function invalidateBusinessProfile(workspaceId: string): Promise<void> {
  await prisma.aiInteraction.updateMany({
    where: {
      workspaceId,
      agent: businessProfileAgentName,
      deletedAt: null,
      OR: [{ regenerated: null }, { regenerated: false }]
    },
    data: {
      regenerated: true
    }
  });
}

async function onboardingContext(workspaceId: string): Promise<VaultRagChunk[]> {
  const vault = await listVault(workspaceId);

  return Object.values(vault)
    .flat()
    .filter((entry) => entry.key !== "business-profile")
    .slice(0, 20)
    .map((entry) => ({
      id: entry.id,
      section: entry.section,
      key: entry.key,
      value: entry.value,
      version: entry.version,
      score: 1
    }));
}

function emptyBusinessProfileState(): OnboardingBusinessProfileState {
  return {
    status: "NOT_GENERATED",
    interactionId: null,
    profile: null,
    updatedAt: null
  };
}

function readRecord(value: Prisma.JsonValue): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
