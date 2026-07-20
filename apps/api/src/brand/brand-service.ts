import type { BrandBookExport, KnowledgeVault, MediaAsset, Prisma } from "@prisma/client";
import type {
  BrandBookExportRecord,
  BrandKit,
  BrandKitAsset,
  BrandKitRule,
  BrandKitSourceEntry,
  VaultSection
} from "@markos/shared-types";
import { prisma } from "../db/prisma";
import { getVaultScore } from "../vault/vault-service";

const brandSections: VaultSection[] = ["BRAND", "TONE"];
const messagingSections: VaultSection[] = ["STORY", "PRODUCTS", "AUDIENCE", "OBJECTIVES", "COMPETITORS"];

export class BrandKitContextMissingError extends Error {
  constructor() {
    super("Complete at least one Knowledge Vault section before exporting a brand book");
  }
}

export class BrandBookExportNotFoundError extends Error {
  constructor() {
    super("Brand book export was not found");
  }
}

export async function getBrandKit(workspaceId: string): Promise<BrandKit> {
  const [entries, assets, score] = await Promise.all([
    prisma.knowledgeVault.findMany({
      where: {
        workspaceId,
        deletedAt: null
      },
      orderBy: [{ section: "asc" }, { key: "asc" }, { updatedAt: "desc" }]
    }),
    prisma.mediaAsset.findMany({
      where: {
        workspaceId,
        type: "BRAND_ASSET",
        deletedAt: null
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 20
    }),
    getVaultScore(workspaceId)
  ]);
  const sourceEntries = entries.map(toBrandKitSourceEntry);
  const missingSections = score.missingSections;

  return {
    workspaceId,
    generatedAt: new Date().toISOString(),
    confidence: calculateConfidence(score.score, entries, assets),
    score,
    companyProfile: buildRules(entries.filter((entry) => entry.section === "COMPANY"), "Company"),
    toneRules: buildToneRules(entries),
    messagingPillars: buildRules(
      entries.filter((entry) => messagingSections.includes(entry.section as VaultSection)),
      "Message"
    ),
    visualRules: buildVisualRules(entries, assets),
    assets: assets.map(toBrandKitAsset),
    missingSections,
    notes: buildNotes(missingSections, assets),
    sourceEntries,
    unsupportedClaims: []
  };
}

export async function listBrandBookExports(workspaceId: string, limit: number): Promise<BrandBookExportRecord[]> {
  const rows = await prisma.brandBookExport.findMany({
    where: {
      workspaceId,
      deletedAt: null
    },
    orderBy: {
      version: "desc"
    },
    take: limit
  });

  return rows.map(toBrandBookExportRecord);
}

export async function getBrandBookExport(workspaceId: string, exportId: string): Promise<BrandBookExportRecord> {
  const row = await prisma.brandBookExport.findFirst({
    where: {
      id: exportId,
      workspaceId,
      deletedAt: null
    }
  });

  if (!row) {
    throw new BrandBookExportNotFoundError();
  }

  return toBrandBookExportRecord(row);
}

export async function createBrandBookExport(workspaceId: string, actorId: string): Promise<BrandBookExportRecord> {
  const kit = await getBrandKit(workspaceId);

  if (kit.sourceEntries.length === 0) {
    throw new BrandKitContextMissingError();
  }

  const created = await prisma.$transaction(async (tx) => {
    const latest = await tx.brandBookExport.findFirst({
      where: {
        workspaceId,
        deletedAt: null
      },
      orderBy: {
        version: "desc"
      },
      select: {
        version: true
      }
    });
    const version = (latest?.version ?? 0) + 1;
    const row = await tx.brandBookExport.create({
      data: {
        workspaceId,
        version,
        status: "EXPORTED",
        title: `MARKOS Brand Book v${version}`,
        content: kit as unknown as Prisma.InputJsonValue,
        sourceEntryIds: kit.sourceEntries.map((entry) => entry.id),
        missingSections: kit.missingSections,
        confidence: kit.confidence,
        exportedAt: new Date()
      }
    });

    await tx.auditLog.create({
      data: {
        actorId,
        workspaceId,
        action: "brand_book.exported",
        targetType: "brand_book_export",
        targetId: row.id,
        metadata: {
          confidence: kit.confidence,
          missingSections: kit.missingSections,
          sourceEntryCount: kit.sourceEntries.length,
          version
        } as Prisma.InputJsonValue
      }
    });

    return row;
  });

  return toBrandBookExportRecord(created);
}

function buildToneRules(entries: KnowledgeVault[]): BrandKitRule[] {
  const directToneRules = buildRules(entries.filter((entry) => entry.section === "TONE"), "Tone");
  const brandToneRules = entries
    .filter((entry) => entry.section === "BRAND")
    .flatMap((entry) => {
      const rules: BrandKitRule[] = [];
      const toneWords = stringArrayValue(recordValue(entry.value).toneWords);
      const voiceNotes = stringValue(recordValue(entry.value).voiceNotes);

      if (toneWords.length > 0) {
        rules.push({
          label: "Approved tone words",
          guidance: `Use these approved tone words: ${toneWords.join(", ")}.`,
          sourceEntryIds: [entry.id]
        });
      }

      if (voiceNotes !== undefined) {
        rules.push({
          label: "Voice notes",
          guidance: voiceNotes,
          sourceEntryIds: [entry.id]
        });
      }

      return rules;
    });

  return uniqueRules([...directToneRules, ...brandToneRules]);
}

function buildVisualRules(entries: KnowledgeVault[], assets: MediaAsset[]): BrandKitRule[] {
  const brandEntries = entries.filter((entry) => brandSections.includes(entry.section as VaultSection));
  const rules = brandEntries.flatMap((entry) => {
    const value = recordValue(entry.value);
    const generated: BrandKitRule[] = [];
    const colors = stringArrayValue(value.colors);
    const fonts = stringArrayValue(value.fonts);
    const aestheticWords = stringArrayValue(value.aestheticWords);

    if (colors.length > 0) {
      generated.push({
        label: "Color system",
        guidance: `Use approved brand colors: ${colors.join(", ")}.`,
        sourceEntryIds: [entry.id]
      });
    }

    if (fonts.length > 0) {
      generated.push({
        label: "Typography",
        guidance: `Use approved fonts when available: ${fonts.join(", ")}.`,
        sourceEntryIds: [entry.id]
      });
    }

    if (aestheticWords.length > 0) {
      generated.push({
        label: "Visual personality",
        guidance: `Keep visuals aligned with: ${aestheticWords.join(", ")}.`,
        sourceEntryIds: [entry.id]
      });
    }

    return generated.length > 0 ? generated : buildRuleFromEntry(entry, "Visual");
  });

  if (assets.length > 0) {
    rules.push({
      label: "Approved assets",
      guidance: `Use ${assets.length} approved brand asset${assets.length === 1 ? "" : "s"} from the workspace media library.`,
      sourceEntryIds: []
    });
  }

  return uniqueRules(rules);
}

function buildRules(entries: KnowledgeVault[], labelPrefix: string): BrandKitRule[] {
  return uniqueRules(entries.flatMap((entry) => buildRuleFromEntry(entry, labelPrefix)));
}

function buildRuleFromEntry(entry: KnowledgeVault, labelPrefix: string): BrandKitRule[] {
  const facts = flattenFacts(entry.value).slice(0, 8);

  if (facts.length === 0) {
    return [];
  }

  return [
    {
      label: `${labelPrefix}: ${humanize(entry.key)}`,
      guidance: facts.join("; "),
      sourceEntryIds: [entry.id]
    }
  ];
}

function buildNotes(missingSections: VaultSection[], assets: MediaAsset[]): string[] {
  const notes = ["Generated only from active Knowledge Vault entries and approved workspace brand assets."];

  if (missingSections.length > 0) {
    notes.push(`Missing Vault sections: ${missingSections.map(humanize).join(", ")}.`);
  }

  if (assets.length === 0) {
    notes.push("No approved brand assets are attached yet; add logo, color, and guideline assets for stronger visual rules.");
  }

  return notes;
}

function calculateConfidence(score: number, entries: KnowledgeVault[], assets: MediaAsset[]): number {
  if (entries.length === 0) {
    return 0;
  }

  const sourceDepth = Math.min(entries.length / 12, 1);
  const hasBrand = entries.some((entry) => entry.section === "BRAND") ? 1 : 0;
  const hasTone = entries.some((entry) => entry.section === "TONE" || (entry.section === "BRAND" && stringArrayValue(recordValue(entry.value).toneWords).length > 0)) ? 1 : 0;
  const hasAssets = assets.length > 0 ? 1 : 0;
  const confidence = score / 100 * 0.55 + sourceDepth * 0.2 + hasBrand * 0.1 + hasTone * 0.1 + hasAssets * 0.05;

  return Math.round(Math.min(confidence, 1) * 100) / 100;
}

function uniqueRules(rules: BrandKitRule[]): BrandKitRule[] {
  const seen = new Set<string>();

  return rules.filter((rule) => {
    const key = `${rule.label}:${rule.guidance}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function toBrandKitSourceEntry(entry: KnowledgeVault): BrandKitSourceEntry {
  return {
    id: entry.id,
    section: entry.section as VaultSection,
    key: entry.key,
    value: recordValue(entry.value),
    version: entry.version,
    updatedAt: entry.updatedAt.toISOString()
  };
}

function toBrandKitAsset(asset: MediaAsset): BrandKitAsset {
  return {
    id: asset.id,
    filename: asset.filename,
    mimeType: asset.mimeType,
    publicUrl: asset.cdnUrl,
    type: asset.type
  };
}

function toBrandBookExportRecord(row: BrandBookExport): BrandBookExportRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    version: row.version,
    status: row.status,
    title: row.title,
    content: row.content as unknown as BrandKit,
    sourceEntryIds: row.sourceEntryIds,
    missingSections: row.missingSections as VaultSection[],
    confidence: row.confidence,
    ...(row.exportedAt === null ? {} : { exportedAt: row.exportedAt.toISOString() }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function flattenFacts(value: unknown, prefix?: string): string[] {
  if (typeof value === "string") {
    const clean = value.trim();
    return clean.length === 0 ? [] : [prefix === undefined ? clean : `${humanize(prefix)}: ${clean}`];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [prefix === undefined ? String(value) : `${humanize(prefix)}: ${String(value)}`];
  }

  if (Array.isArray(value)) {
    const values = value.flatMap((item) => flattenFacts(item));
    return values.length === 0 ? [] : [prefix === undefined ? values.join(", ") : `${humanize(prefix)}: ${values.join(", ")}`];
  }

  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, nested]) => flattenFacts(nested, key));
  }

  return [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
