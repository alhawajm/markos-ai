import type { OnboardingState, VaultSection } from "@markos/shared-types";
import {
  audienceOnboardingSchema,
  brandOnboardingSchema,
  companyOnboardingSchema,
  competitorsOnboardingSchema,
  objectivesOnboardingSchema,
  onboardingModuleSchema,
  productsOnboardingSchema,
  storyOnboardingSchema,
  type OnboardingModuleInput
} from "@markos/validation";
import type { OfferingSourceType } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../db/prisma";
import { saveOfferingCatalog } from "../offerings/offering-catalog-service";
import { getVaultScore } from "../vault/vault-service";
import { getBusinessKnowledge, saveBusinessKnowledge } from "../business-profile/knowledge-service";
import { getBusinessProfileState, invalidateBusinessProfile } from "./business-profile-service";

type OnboardingPayload =
  | z.infer<typeof companyOnboardingSchema>
  | z.infer<typeof storyOnboardingSchema>
  | z.infer<typeof productsOnboardingSchema>
  | z.infer<typeof audienceOnboardingSchema>
  | z.infer<typeof competitorsOnboardingSchema>
  | z.infer<typeof brandOnboardingSchema>
  | z.infer<typeof objectivesOnboardingSchema>;

interface SaveOnboardingModuleOptions {
  offeringSource?: { sourceRef?: string; sourceType: OfferingSourceType };
  preserveApprovedProfile?: boolean;
}

const moduleSections: Record<OnboardingModuleInput, VaultSection[]> = {
  company: ["COMPANY"],
  story: ["STORY"],
  products: ["PRODUCTS"],
  audience: ["AUDIENCE"],
  competitors: ["COMPETITORS"],
  brand: ["TONE"],
  objectives: ["OBJECTIVES"]
};

const onboardingModules = onboardingModuleSchema.options;
const requiredOnboardingModules = new Set<OnboardingModuleInput>(["company", "products"]);

export class OnboardingIncompleteError extends Error {
  constructor(public readonly state: OnboardingState) {
    super("Onboarding is incomplete");
  }
}

export class RequiredOnboardingModuleError extends Error {
  constructor() {
    super("This onboarding section is required before MARKOS can prepare a business profile");
  }
}

export async function getOnboardingState(workspaceId: string): Promise<OnboardingState> {
  const [workspace, vaultScore, businessProfile] = await Promise.all([
    prisma.workspace.findFirstOrThrow({
      where: {
        id: workspaceId,
        deletedAt: null
      },
      select: {
        onboardingStatus: true,
        onboardingScore: true,
        onboardingSkippedModules: true
      }
    }),
    getVaultScore(workspaceId),
    getBusinessProfileState(workspaceId)
  ]);

  const completed = new Set(vaultScore.completedSections);
  const skipped = new Set(workspace.onboardingSkippedModules);
  const modules = onboardingModules.map((module) => ({
    module,
    sections: moduleSections[module],
    completed: moduleSections[module].every((section) => completed.has(section)),
    skipped: skipped.has(module)
  }));

  return {
    status: workspace.onboardingStatus,
    onboardingScore: workspace.onboardingScore,
    readyForProfile: [...requiredOnboardingModules].every((module) => modules.some((state) => state.module === module && state.completed)),
    vaultScore,
    businessProfile,
    modules
  };
}

export async function saveOnboardingModule(
  workspaceId: string,
  module: OnboardingModuleInput,
  payload: OnboardingPayload,
  options: SaveOnboardingModuleOptions = {}
): Promise<OnboardingState> {
  const preserveApprovedProfile = (await getBusinessProfileState(workspaceId)).status === "APPROVED";

  if (module === "products") {
    await saveOfferingCatalog(workspaceId, payload as z.infer<typeof productsOnboardingSchema>, options.offeringSource);
  } else {
    const knowledge = await getBusinessKnowledge(workspaceId);
    await saveBusinessKnowledge(workspaceId, { module, expectedVersion: knowledge.version, changes: payload as Record<string, unknown> }, false, false);
  }

  const vaultScore = await getVaultScore(workspaceId);
  if (!preserveApprovedProfile) await invalidateBusinessProfile(workspaceId);
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { onboardingSkippedModules: true }
  });
  await prisma.workspace.update({
    where: {
      id: workspaceId
    },
    data: {
      onboardingStatus: preserveApprovedProfile ? "COMPLETE" : "IN_PROGRESS",
      onboardingScore: vaultScore.score,
      onboardingSkippedModules: {
        set: workspace.onboardingSkippedModules.filter((item) => item !== module)
      }
    }
  });

  return getOnboardingState(workspaceId);
}

export async function skipOnboardingModule(
  workspaceId: string,
  module: OnboardingModuleInput,
  options: SaveOnboardingModuleOptions = {}
): Promise<OnboardingState> {
  if (requiredOnboardingModules.has(module)) {
    throw new RequiredOnboardingModuleError();
  }

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { onboardingSkippedModules: true }
  });
  const preserveApprovedProfile = (await getBusinessProfileState(workspaceId)).status === "APPROVED";

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      onboardingStatus: preserveApprovedProfile ? "COMPLETE" : "IN_PROGRESS",
      onboardingSkippedModules: {
        set: Array.from(new Set([...workspace.onboardingSkippedModules, module]))
      }
    }
  });

  return getOnboardingState(workspaceId);
}

export async function completeOnboarding(workspaceId: string): Promise<OnboardingState> {
  const state = await getOnboardingState(workspaceId);

  if (!state.readyForProfile || state.businessProfile.status !== "APPROVED") {
    throw new OnboardingIncompleteError(state);
  }

  await prisma.workspace.update({
    where: {
      id: workspaceId
    },
    data: {
      onboardingStatus: "COMPLETE",
      onboardingScore: state.vaultScore.score
    }
  });

  return getOnboardingState(workspaceId);
}
