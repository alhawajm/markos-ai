import { Prisma } from "@prisma/client";
import type { KnowledgeVaultEntry, VaultCompletenessScore, VaultRagChunk, VaultSection } from "@markos/shared-types";
import type { UpsertVaultSectionInput, VaultRagSearchInput } from "@markos/validation";
import { vaultSections } from "@markos/shared-types";
import { embedVaultTexts } from "../ai/embeddings-client";
import { prisma } from "../db/prisma";

const requiredSections: VaultSection[] = [...vaultSections];

export async function listVault(workspaceId: string): Promise<Record<VaultSection, KnowledgeVaultEntry[]>> {
  const entries = await prisma.knowledgeVault.findMany({
    where: {
      workspaceId,
      deletedAt: null
    },
    orderBy: [{ section: "asc" }, { key: "asc" }]
  });

  return requiredSections.reduce<Record<VaultSection, KnowledgeVaultEntry[]>>((grouped, section) => {
    grouped[section] = entries.filter((entry) => entry.section === section).map(toVaultEntry);
    return grouped;
  }, {} as Record<VaultSection, KnowledgeVaultEntry[]>);
}

export async function listVaultSection(workspaceId: string, section: VaultSection): Promise<KnowledgeVaultEntry[]> {
  const entries = await prisma.knowledgeVault.findMany({
    where: {
      workspaceId,
      section,
      deletedAt: null
    },
    orderBy: {
      key: "asc"
    }
  });

  return entries.map(toVaultEntry);
}

export async function upsertVaultSection(
  workspaceId: string,
  section: VaultSection,
  input: UpsertVaultSectionInput
): Promise<KnowledgeVaultEntry[]> {
  const texts = input.entries.map((entry) => vaultEntryToEmbeddingText(section, entry.key, entry.value));
  const { embeddings } = await embedVaultTexts(texts);
  const saved: KnowledgeVaultEntry[] = [];

  await prisma.$transaction(async (tx) => {
    for (const [index, entry] of input.entries.entries()) {
      const existing = await tx.knowledgeVault.findFirst({
        where: {
          workspaceId,
          section,
          key: entry.key,
          deletedAt: null
        },
        orderBy: {
          version: "desc"
        }
      });

      const row =
        existing === null
          ? await tx.knowledgeVault.create({
              data: {
                workspaceId,
                section,
                key: entry.key,
                value: entry.value as Prisma.InputJsonValue
              }
            })
          : await tx.knowledgeVault.update({
              where: {
                id: existing.id
              },
              data: {
                value: entry.value as Prisma.InputJsonValue,
                version: {
                  increment: 1
                }
              }
            });

      const embedding = embeddings[index];

      if (embedding === undefined) {
        throw new Error("Missing embedding for Vault entry");
      }

      await setVaultEmbedding(tx, row.id, embedding);
      saved.push(toVaultEntry(row));
    }
  });

  return saved;
}

export async function getVaultScore(workspaceId: string): Promise<VaultCompletenessScore> {
  const sections = await prisma.knowledgeVault.findMany({
    where: {
      workspaceId,
      deletedAt: null
    },
    distinct: ["section"],
    select: {
      section: true
    }
  });
  const entryCount = await prisma.knowledgeVault.count({
    where: {
      workspaceId,
      deletedAt: null
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
  const { embeddings } = await embedVaultTexts([input.query]);
  const embedding = embeddings[0];

  if (embedding === undefined) {
    throw new Error("Missing embedding for Vault search query");
  }

  const vector = toVectorLiteral(embedding);
  const sectionFilter =
    input.section === undefined
      ? Prisma.empty
      : Prisma.sql`AND section::text = ${input.section}`;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      section: VaultSection;
      key: string;
      value: Record<string, unknown>;
      version: number;
      score: number;
    }>
  >`
    SELECT
      id,
      section::text AS section,
      key,
      value,
      version,
      1 - (embedding <=> ${vector}::vector) AS score
    FROM knowledge_vault
    WHERE "workspaceId" = ${workspaceId}::uuid
      AND "deletedAt" IS NULL
      AND embedding IS NOT NULL
      ${sectionFilter}
    ORDER BY embedding <=> ${vector}::vector
    LIMIT ${input.topK}
  `;

  return rows.map((row) => ({
    id: row.id,
    section: row.section,
    key: row.key,
    value: row.value,
    version: row.version,
    score: Number(row.score)
  }));
}

async function setVaultEmbedding(tx: Prisma.TransactionClient, id: string, embedding: number[]): Promise<void> {
  await tx.$executeRaw`
    UPDATE knowledge_vault
    SET embedding = ${toVectorLiteral(embedding)}::vector
    WHERE id = ${id}::uuid
  `;
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
