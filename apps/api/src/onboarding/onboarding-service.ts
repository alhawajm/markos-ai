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
  type OnboardingModuleInput,
  type UpsertVaultSectionInput
} from "@markos/validation";
import type { z } from "zod";
import { prisma } from "../db/prisma";
import { saveOfferingCatalog } from "../offerings/offering-catalog-service";
import { getVaultScore, upsertVaultSection } from "../vault/vault-service";
import { getBusinessProfileState, invalidateBusinessProfile } from "./business-profile-service";

type OnboardingPayload =
  | z.infer<typeof companyOnboardingSchema>
  | z.infer<typeof storyOnboardingSchema>
  | z.infer<typeof productsOnboardingSchema>
  | z.infer<typeof audienceOnboardingSchema>
  | z.infer<typeof competitorsOnboardingSchema>
  | z.infer<typeof brandOnboardingSchema>
  | z.infer<typeof objectivesOnboardingSchema>;

interface VaultWrite {
  section: VaultSection;
  input: UpsertVaultSectionInput;
}

interface SaveOnboardingModuleOptions {
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
  const preserveApprovedProfile = options.preserveApprovedProfile === true && (await getBusinessProfileState(workspaceId)).status === "APPROVED";

  if (module === "products") {
    await saveOfferingCatalog(workspaceId, payload as z.infer<typeof productsOnboardingSchema>);
  } else {
    for (const write of toVaultWrites(module, payload)) {
      await upsertVaultSection(workspaceId, write.section, write.input);
    }
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
  const preserveApprovedProfile = options.preserveApprovedProfile === true && (await getBusinessProfileState(workspaceId)).status === "APPROVED";

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

function toVaultWrites(module: OnboardingModuleInput, payload: OnboardingPayload): VaultWrite[] {
  switch (module) {
    case "company":
      return [{ section: "COMPANY", input: { entries: [{ key: "profile", value: payload as Record<string, unknown> }] } }];
    case "story":
      return [{ section: "STORY", input: { entries: [{ key: "story", value: payload as Record<string, unknown> }] } }];
    case "products":
      return [];
    case "audience":
      return [{ section: "AUDIENCE", input: { entries: [{ key: "primary-audience", value: payload as Record<string, unknown> }] } }];
    case "competitors":
      return [{ section: "COMPETITORS", input: { entries: [{ key: "competitors", value: payload as Record<string, unknown> }] } }];
    case "brand": {
      const brand = payload as z.infer<typeof brandOnboardingSchema>;
      const writes: VaultWrite[] = [];
      if (brand.aestheticWords.length || brand.colors.length || brand.fonts.length || brand.logoMediaId || brand.guidelinesMediaId) {
        writes.push({
          section: "BRAND",
          input: {
            entries: [
              {
                key: "identity",
                value: {
                  aestheticWords: brand.aestheticWords,
                  logoMediaId: brand.logoMediaId,
                  colors: brand.colors,
                  fonts: brand.fonts,
                  guidelinesMediaId: brand.guidelinesMediaId
                }
              }
            ]
          }
        });
      }
      if (brand.toneWords.length || brand.voiceNotes) {
        writes.push({
          section: "TONE",
          input: {
            entries: [
              {
                key: "voice",
                value: {
                  toneWords: brand.toneWords,
                  voiceNotes: brand.voiceNotes
                }
              }
            ]
          }
        });
      }
      return writes;
    }
    case "objectives":
      return [{ section: "OBJECTIVES", input: { entries: [{ key: "goals", value: payload as Record<string, unknown> }] } }];
  }
}
