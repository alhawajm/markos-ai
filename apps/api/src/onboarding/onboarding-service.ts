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

const moduleSections: Record<OnboardingModuleInput, VaultSection[]> = {
  company: ["COMPANY"],
  story: ["STORY"],
  products: ["PRODUCTS"],
  audience: ["AUDIENCE"],
  competitors: ["COMPETITORS"],
  brand: ["BRAND", "TONE"],
  objectives: ["OBJECTIVES"]
};

const onboardingModules = onboardingModuleSchema.options;

export class OnboardingIncompleteError extends Error {
  constructor(public readonly state: OnboardingState) {
    super("Onboarding is incomplete");
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
        onboardingScore: true
      }
    }),
    getVaultScore(workspaceId),
    getBusinessProfileState(workspaceId)
  ]);

  const completed = new Set(vaultScore.completedSections);

  return {
    status: workspace.onboardingStatus,
    onboardingScore: workspace.onboardingScore,
    vaultScore,
    businessProfile,
    modules: onboardingModules.map((module) => ({
      module,
      sections: moduleSections[module],
      completed: moduleSections[module].every((section) => completed.has(section))
    }))
  };
}

export async function saveOnboardingModule(workspaceId: string, module: OnboardingModuleInput, payload: OnboardingPayload): Promise<OnboardingState> {
  for (const write of toVaultWrites(module, payload)) {
    await upsertVaultSection(workspaceId, write.section, write.input);
  }

  const vaultScore = await getVaultScore(workspaceId);
  await invalidateBusinessProfile(workspaceId);
  await prisma.workspace.update({
    where: {
      id: workspaceId
    },
    data: {
      onboardingStatus: "IN_PROGRESS",
      onboardingScore: vaultScore.score
    }
  });

  return getOnboardingState(workspaceId);
}

export async function completeOnboarding(workspaceId: string): Promise<OnboardingState> {
  const state = await getOnboardingState(workspaceId);

  if (state.vaultScore.score < 100 || state.businessProfile.status !== "APPROVED") {
    throw new OnboardingIncompleteError(state);
  }

  await prisma.workspace.update({
    where: {
      id: workspaceId
    },
    data: {
      onboardingStatus: "COMPLETE",
      onboardingScore: 100
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
      return [{ section: "PRODUCTS", input: { entries: [{ key: "catalog", value: payload as Record<string, unknown> }] } }];
    case "audience":
      return [{ section: "AUDIENCE", input: { entries: [{ key: "primary-audience", value: payload as Record<string, unknown> }] } }];
    case "competitors":
      return [{ section: "COMPETITORS", input: { entries: [{ key: "competitors", value: payload as Record<string, unknown> }] } }];
    case "brand": {
      const brand = payload as z.infer<typeof brandOnboardingSchema>;
      return [
        {
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
        },
        {
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
        }
      ];
    }
    case "objectives":
      return [{ section: "OBJECTIVES", input: { entries: [{ key: "goals", value: payload as Record<string, unknown> }] } }];
  }
}
