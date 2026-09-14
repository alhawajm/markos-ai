import type { Prisma } from "@prisma/client";
import type {
  BusinessKnowledgeModule,
  BusinessKnowledgeRecord,
  BusinessProfile,
  KnowledgeVaultEntry,
  UpdateBusinessKnowledge,
  VaultSection
} from "@markos/shared-types";
import {
  audienceOnboardingSchema,
  brandOnboardingSchema,
  companyOnboardingSchema,
  competitorsOnboardingSchema,
  objectivesOnboardingSchema,
  storyOnboardingSchema
} from "@markos/validation";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { getOfferingCatalog } from "../offerings/offering-catalog-service";
import { authoritativeProfileKey, indexVaultEntries, lockWorkspaceKnowledge, persistVaultSection } from "../vault/vault-service";

export class KnowledgeConflictError extends Error {
  readonly statusCode = 409;
  readonly code = "KNOWLEDGE_REVISION_CONFLICT";
  constructor(message = "This information changed in another session. Keep your edits, reload the latest profile, and review before saving again.") {
    super(message);
  }
}

export const knowledgeSchemas = {
  company: companyOnboardingSchema,
  story: z.object(storyOnboardingSchema.shape),
  audience: z.object(audienceOnboardingSchema.shape),
  competitors: z.object(competitorsOnboardingSchema.shape),
  brand: z.object(brandOnboardingSchema.shape),
  objectives: z.object(objectivesOnboardingSchema.shape)
};

const bindings: Record<BusinessKnowledgeModule, Array<[VaultSection, string]>> = {
  company: [["COMPANY", "profile"]],
  story: [["STORY", "story"]],
  audience: [["AUDIENCE", "primary-audience"]],
  competitors: [["COMPETITORS", "competitors"]],
  brand: [
    ["BRAND", "identity"],
    ["TONE", "voice"]
  ],
  objectives: [["OBJECTIVES", "goals"]]
};

export interface StoredKnowledge {
  modules: BusinessKnowledgeRecord["modules"];
  approved: boolean;
  introduction?: BusinessProfile;
  interactionId?: string;
  summaryCurrent?: boolean;
}

/** The reserved record is authoritative storage, not a retrievable chunk. Existing rows are imported on the first write. */
export async function readStoredKnowledge(tx: Prisma.TransactionClient, workspaceId: string) {
  const rows = await tx.knowledgeVault.findMany({ where: { workspaceId, deletedAt: null }, orderBy: { updatedAt: "desc" } });
  const current = rows.find((row) => row.key === authoritativeProfileKey && row.section === "COMPANY");
  if (current) return { stored: current.value as unknown as StoredKnowledge, version: current.version, updatedAt: current.updatedAt.toISOString() };
  const modules = Object.fromEntries(
    Object.entries(bindings).map(([module, entries]) => [
      module,
      Object.assign({}, ...entries.map(([section, key]) => rows.find((row) => row.section === section && row.key === key)?.value ?? {}))
    ])
  ) as BusinessKnowledgeRecord["modules"];
  const workspace = await tx.workspace.findFirstOrThrow({ where: { id: workspaceId, deletedAt: null } });
  const approvedRow = rows.find((row) => row.section === "COMPANY" && row.key === "business-profile");
  const stored: StoredKnowledge = { modules, approved: workspace.onboardingStatus === "COMPLETE" };
  if (approvedRow && stored.approved) {
    stored.introduction = approvedRow.value as unknown as BusinessProfile;
    stored.summaryCurrent = true;
  }
  return { stored, version: 0, updatedAt: rows[0]?.updatedAt.toISOString() ?? null };
}

export async function getBusinessKnowledge(workspaceId: string): Promise<BusinessKnowledgeRecord> {
  return prisma.$transaction(async (tx) => {
    await lockWorkspaceKnowledge(tx, workspaceId);
    const { stored, version, updatedAt } = await readStoredKnowledge(tx, workspaceId);
    // Catalog reads use the same lock as all writers, so profile + catalog form a consistent snapshot.
    const catalog = await getOfferingCatalog(workspaceId, tx);
    return { modules: stored.modules, approved: stored.approved, version, updatedAt, catalog };
  });
}

export async function persistKnowledge(tx: Prisma.TransactionClient, workspaceId: string, stored: StoredKnowledge) {
  return persistVaultSection(tx, workspaceId, "COMPANY", {
    entries: [{ key: authoritativeProfileKey, value: JSON.parse(JSON.stringify(stored)) as Record<string, unknown> }]
  });
}

export async function retireProfileSummary(tx: Prisma.TransactionClient, workspaceId: string): Promise<void> {
  await tx.knowledgeVault.updateMany({ where: { workspaceId, section: "COMPANY", key: "business-profile", deletedAt: null }, data: { deletedAt: new Date() } });
}

export async function saveBusinessKnowledge(workspaceId: string, input: UpdateBusinessKnowledge, requireApproved = true, checkRevision = true): Promise<void> {
  const saved = await prisma.$transaction((tx) => applyBusinessKnowledgeChanges(tx, workspaceId, [input], requireApproved, checkRevision));
  // Maintenance saves never wait on AI. Retrieval indexes these committed facts when needed.
  if (!requireApproved) await indexVaultEntries(saved);
}

/** Shared atomic writer for owner-reviewed modules, including Instagram onboarding additions. */
export async function applyBusinessKnowledgeChanges(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  inputs: UpdateBusinessKnowledge[],
  requireApproved = true,
  checkRevision = true
) {
  await lockWorkspaceKnowledge(tx, workspaceId);
  const { stored, version } = await readStoredKnowledge(tx, workspaceId);
  if (requireApproved && !stored.approved)
    throw Object.assign(new Error("Complete onboarding before maintaining your business profile."), { statusCode: 409, code: "ONBOARDING_REQUIRED" });
  const projections: KnowledgeVaultEntry[] = [];
  for (const input of inputs) {
    if (checkRevision && input.expectedVersion !== version) throw new KnowledgeConflictError();
    const schema = knowledgeSchemas[input.module];
    const fields = schema.shape;
    const next = { ...stored.modules[input.module] };
    for (const [key, value] of Object.entries(input.changes)) {
      if (!Object.hasOwn(fields, key)) throw Object.assign(new Error(`Unknown profile field: ${key}`), { statusCode: 400, code: "VALIDATION_ERROR" });
      if (value === null) delete next[key];
      else next[key] = value;
    }
    const parsed = schema.safeParse(next);
    if (!parsed.success)
      throw Object.assign(new Error(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")), {
        statusCode: 400,
        code: "VALIDATION_ERROR"
      });
    // Parsed validation defaults are safe; no model-generated rewriting or normalization.
    stored.modules[input.module] = parsed.data;
    stored.summaryCurrent = false;
    for (const [section, key] of bindings[input.module]) {
      const value =
        input.module !== "brand"
          ? parsed.data
          : Object.fromEntries(Object.entries(parsed.data).filter(([field]) => (section === "TONE") === ["toneWords", "voiceNotes"].includes(field)));
      const meaningful = Object.values(value).some((item) =>
        Array.isArray(item) ? item.length : typeof item === "object" && item !== null ? Object.keys(item).length : Boolean(item)
      );
      if (meaningful) projections.push(...(await persistVaultSection(tx, workspaceId, section, { entries: [{ key, value }] })));
      else await tx.knowledgeVault.updateMany({ where: { workspaceId, section, key, deletedAt: null }, data: { deletedAt: new Date() } });
    }
  }
  await persistKnowledge(tx, workspaceId, stored);
  await retireProfileSummary(tx, workspaceId);
  return projections;
}

export function isManagedKnowledgeKey(section: VaultSection, key: string): boolean {
  return (
    key === authoritativeProfileKey ||
    key === "business-profile" ||
    section === "PRODUCTS" ||
    Object.values(bindings)
      .flat()
      .some(([boundSection, boundKey]) => section === boundSection && key === boundKey)
  );
}

/** Compatibility shape for onboarding after maintenance: saved text, never an AI reinterpretation or claimed translation. */
export function currentProfileSummary(stored: StoredKnowledge, catalog: BusinessKnowledgeRecord["catalog"]): BusinessProfile {
  const { company, story, audience, competitors, brand, objectives } = stored.modules;
  const text = (...values: unknown[]): string =>
    values
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter((value) => typeof value === "string" && value.length)
      .join("\n");
  const localized = (...values: unknown[]) => {
    const value = text(...values);
    return { en: value, ar: value };
  };
  return {
    businessName: text(company.name),
    tagline: localized(story.mission),
    overview: localized(company.description, story.origin),
    uniqueValue: localized(story.usp),
    offerSummary: localized(
      catalog?.summary,
      catalog?.offerings.filter((item) => item.status === "ACTIVE").map((item) => item.name)
    ),
    idealCustomer: localized(audience.demographics, audience.locations, audience.painPoints),
    marketPosition: localized(competitors.marketContext, competitors.competitiveAdvantage),
    brandVoice: localized(brand.toneWords, brand.voiceNotes),
    marketingFocus: localized(objectives.currentPriority, objectives.goals, objectives.success90Days)
  };
}
