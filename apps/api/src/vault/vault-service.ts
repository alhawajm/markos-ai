import { Prisma } from "@prisma/client";
import type { KnowledgeVaultEntry, KnowledgeVaultHistoryEntry, VaultCompletenessScore, VaultRagChunk, VaultSection } from "@markos/shared-types";
import type { UpsertVaultSectionInput, VaultRagSearchInput } from "@markos/validation";
import { vaultSections } from "@markos/shared-types";
import { embedVaultTexts } from "../ai/embeddings-client";
import { prisma } from "../db/prisma";

export const authoritativeProfileKey = "authoritative-profile";

const requiredSections: VaultSection[] = [...vaultSections];

export async function listVault(workspaceId: string): Promise<Record<VaultSection, KnowledgeVaultEntry[]>> {
  const entries = await prisma.knowledgeVault.findMany({
    where: {
      workspaceId,
      deletedAt: null,
      key: { not: authoritativeProfileKey }
    },
    orderBy: [{ section: "asc" }, { key: "asc" }]
  });

  return requiredSections.reduce<Record<VaultSection, KnowledgeVaultEntry[]>>(
    (grouped, section) => {
      grouped[section] = entries.filter((entry) => entry.section === section).map(toVaultEntry);
      return grouped;
    },
    {} as Record<VaultSection, KnowledgeVaultEntry[]>
  );
}

export async function listVaultSection(workspaceId: string, section: VaultSection): Promise<KnowledgeVaultEntry[]> {
  const entries = await prisma.knowledgeVault.findMany({
    where: {
      workspaceId,
      section,
      deletedAt: null,
      key: { not: authoritativeProfileKey }
    },
    orderBy: {
      key: "asc"
    }
  });

  return entries.map(toVaultEntry);
}

export async function listVaultEntryHistory(workspaceId: string, section: VaultSection, key: string): Promise<KnowledgeVaultHistoryEntry[]> {
  const entries = await prisma.knowledgeVaultHistory.findMany({
    where: {
      workspaceId,
      section,
      key
    },
    orderBy: {
      version: "desc"
    }
  });

  return entries.map(toVaultHistoryEntry);
}

/** Serialize knowledge writes, including the first profile/catalog write, within a workspace. */
export async function lockWorkspaceKnowledge(tx: Prisma.TransactionClient, workspaceId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${workspaceId}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
}

/** Caller owns the transaction. Clear embeddings before a new value becomes visible. */
export async function persistVaultSection(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  section: VaultSection,
  input: UpsertVaultSectionInput
): Promise<KnowledgeVaultEntry[]> {
  const saved: KnowledgeVaultEntry[] = [];
  for (const entry of input.entries) {
    const existing = await tx.knowledgeVault.findFirst({
      where: { workspaceId, section, key: entry.key },
      orderBy: [{ version: "desc" }, { updatedAt: "desc" }]
    });
    const row =
      existing === null
        ? await tx.knowledgeVault.create({ data: { workspaceId, section, key: entry.key, value: entry.value as Prisma.InputJsonValue } })
        : await tx.knowledgeVault.update({
            where: { id: existing.id },
            data: { value: entry.value as Prisma.InputJsonValue, version: { increment: 1 }, deletedAt: null }
          });
    await tx.$executeRaw`UPDATE knowledge_vault SET embedding = NULL WHERE id = ${row.id}::uuid`;
    await tx.knowledgeVaultHistory.create({
      data: { workspaceId, knowledgeVaultId: row.id, section, key: row.key, value: row.value as Prisma.InputJsonValue, version: row.version }
    });
    saved.push(toVaultEntry(row));
  }
  return saved;
}

/** Index only committed revisions. An outage cannot turn an owner edit into a failed save. */
export async function indexVaultEntries(entries: KnowledgeVaultEntry[]): Promise<boolean> {
  const eligible = entries.filter((entry) => entry.key !== authoritativeProfileKey);
  if (!eligible.length) return true;
  try {
    const { embeddings } = await embedVaultTexts(eligible.map((entry) => vaultEntryToEmbeddingText(entry.section, entry.key, entry.value)));
    for (const [index, entry] of eligible.entries()) {
      const embedding = embeddings[index];
      if (!embedding) throw new Error("Missing embedding for Vault entry");
      await prisma.$executeRaw`UPDATE knowledge_vault SET embedding = ${toVectorLiteral(embedding)}::vector
        WHERE id = ${entry.id}::uuid AND "workspaceId" = ${entry.workspaceId}::uuid AND version = ${entry.version} AND "deletedAt" IS NULL`;
    }
    return true;
  } catch {
    return false;
  }
}

export async function upsertVaultSection(
  workspaceId: string,
  section: VaultSection,
  input: UpsertVaultSectionInput,
  protectManaged = false
): Promise<KnowledgeVaultEntry[]> {
  const saved = await prisma.$transaction(async (tx) => {
    await lockWorkspaceKnowledge(tx, workspaceId);
    if (
      input.entries.some((entry) => entry.key === authoritativeProfileKey) ||
      (protectManaged &&
        ((await tx.knowledgeVault.findFirst({ where: { workspaceId, section: "COMPANY", key: authoritativeProfileKey, deletedAt: null } })) ||
          (await tx.workspace.findUnique({ where: { id: workspaceId }, select: { onboardingStatus: true } }))?.onboardingStatus === "COMPLETE"))
    ) {
      throw Object.assign(new Error("Edit this information through Business Profile or onboarding."), { statusCode: 409, code: "MANAGED_BUSINESS_KNOWLEDGE" });
    }
    return persistVaultSection(tx, workspaceId, section, input);
  });
  await indexVaultEntries(saved);
  return saved;
}

export async function getVaultScore(workspaceId: string): Promise<VaultCompletenessScore> {
  const sections = await prisma.knowledgeVault.findMany({
    where: {
      workspaceId,
      deletedAt: null,
      key: { not: authoritativeProfileKey }
    },
    distinct: ["section"],
    select: {
      section: true
    }
  });
  const entryCount = await prisma.knowledgeVault.count({
    where: {
      workspaceId,
      deletedAt: null,
      key: { not: authoritativeProfileKey }
    }
  });
  const completedSections = sections.map((entry) => entry.section as VaultSection);
  const missingSections = requiredSections.filter((section) => !completedSections.includes(section));

  return {
    score: Math.round((completedSections.length / requiredSections.length) * 100),
    completedSections,
    missingSections,
    requiredSections,
    entryCount
  };
}

export async function searchVaultContext(workspaceId: string, input: VaultRagSearchInput): Promise<VaultRagChunk[]> {
  // Unindexed current facts remain usable during an embedding outage, never superseded values.
  const fallback = async (): Promise<VaultRagChunk[]> => {
    const current = await prisma.knowledgeVault.findMany({
      where: { workspaceId, deletedAt: null, key: { not: authoritativeProfileKey }, ...(input.section ? { section: input.section } : {}) },
      orderBy: { updatedAt: "desc" },
      take: input.topK
    });
    return current.map((entry) => ({ ...toVaultEntry(entry), score: 0 }));
  };
  try {
    const sectionFilter = input.section === undefined ? Prisma.empty : Prisma.sql`AND section::text = ${input.section}`;
    const ids = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM knowledge_vault
      WHERE "workspaceId" = ${workspaceId}::uuid AND "deletedAt" IS NULL AND embedding IS NULL AND key <> ${authoritativeProfileKey}
      ${sectionFilter} ORDER BY "updatedAt" DESC LIMIT ${input.topK}`;
    const unindexed = await prisma.knowledgeVault.findMany({ where: { workspaceId, id: { in: ids.map((row) => row.id) }, deletedAt: null } });
    const { embeddings } = await embedVaultTexts([
      input.query,
      ...unindexed.map((entry) => vaultEntryToEmbeddingText(entry.section, entry.key, entry.value as Record<string, unknown>))
    ]);
    const embedding = embeddings[0];
    if (!embedding) return fallback();
    for (const [index, entry] of unindexed.entries()) {
      const vector = embeddings[index + 1];
      if (vector)
        await prisma.$executeRaw`UPDATE knowledge_vault SET embedding = ${toVectorLiteral(vector)}::vector
        WHERE id = ${entry.id}::uuid AND "workspaceId" = ${workspaceId}::uuid AND version = ${entry.version} AND "deletedAt" IS NULL`;
    }
    const catalogVersion = (unindexed.find((entry) => entry.section === "PRODUCTS" && entry.key === "catalog")?.value as Record<string, unknown> | undefined)
      ?.catalogVersion;
    if (typeof catalogVersion === "number") {
      await prisma.$executeRaw`UPDATE offering_catalogs SET "projectionStatus" = 'READY', "projectedVersion" = version
        WHERE "workspaceId" = ${workspaceId}::uuid AND version = ${catalogVersion} AND "deletedAt" IS NULL AND NOT EXISTS (
          SELECT 1 FROM knowledge_vault WHERE "workspaceId" = ${workspaceId}::uuid AND section = 'PRODUCTS' AND "deletedAt" IS NULL AND embedding IS NULL
        )`;
    }
    const rows = await prisma.$queryRaw<
      Array<{ id: string; section: VaultSection; key: string; value: Record<string, unknown>; version: number; score: number }>
    >`
      SELECT id, section::text AS section, key, value, version,
        CASE WHEN embedding IS NULL THEN 0 ELSE 1 - (embedding <=> ${toVectorLiteral(embedding)}::vector) END AS score
      FROM knowledge_vault WHERE "workspaceId" = ${workspaceId}::uuid AND "deletedAt" IS NULL AND key <> ${authoritativeProfileKey}
      ${sectionFilter}
      ORDER BY (embedding IS NULL) DESC, embedding <=> ${toVectorLiteral(embedding)}::vector, "updatedAt" DESC LIMIT ${input.topK}`;
    return rows.map((row) => ({ ...row, score: Number(row.score) }));
  } catch {
    return fallback();
  }
}

function vaultEntryToEmbeddingText(section: VaultSection, key: string, value: Record<string, unknown>): string {
  return `${section} ${key} ${JSON.stringify(value)}`;
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.map((value) => value.toFixed(8)).join(",")}]`;
}

function toVaultEntry(entry: {
  id: string;
  workspaceId: string;
  section: VaultSection;
  key: string;
  value: Prisma.JsonValue;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): KnowledgeVaultEntry {
  return {
    id: entry.id,
    workspaceId: entry.workspaceId,
    section: entry.section,
    key: entry.key,
    value: entry.value as Record<string, unknown>,
    version: entry.version,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString()
  };
}

function toVaultHistoryEntry(entry: {
  id: string;
  workspaceId: string;
  knowledgeVaultId: string;
  section: VaultSection;
  key: string;
  value: Prisma.JsonValue;
  version: number;
  createdAt: Date;
}): KnowledgeVaultHistoryEntry {
  return {
    id: entry.id,
    workspaceId: entry.workspaceId,
    knowledgeVaultId: entry.knowledgeVaultId,
    section: entry.section,
    key: entry.key,
    value: entry.value as Record<string, unknown>,
    version: entry.version,
    createdAt: entry.createdAt.toISOString()
  };
}
