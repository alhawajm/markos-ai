import type { Offering, OfferingCatalog, OfferingKind, OfferingPriceType, OfferingSourceType, Prisma } from "@prisma/client";
import type { OfferingCatalogRecord, OfferingRecord } from "@markos/shared-types";
import { productsOnboardingSchema } from "@markos/validation";
import type { z } from "zod";
import { prisma } from "../db/prisma";
import { upsertVaultSection } from "../vault/vault-service";

export type OfferingCatalogInput = z.infer<typeof productsOnboardingSchema>;

interface SaveOfferingCatalogOptions {
  sourceRef?: string;
  sourceType?: OfferingSourceType;
}

interface CanonicalSaveResult {
  catalog: OfferingCatalog;
  changed: boolean;
  needsProjection: boolean;
  offerings: Offering[];
}

export async function getOfferingCatalog(workspaceId: string): Promise<OfferingCatalogRecord | null> {
  const catalog = await prisma.offeringCatalog.findFirst({
    where: { workspaceId, deletedAt: null }
  });

  if (catalog === null) return null;

  const offerings = await prisma.offering.findMany({
    where: { workspaceId, catalogId: catalog.id, deletedAt: null },
    orderBy: [{ status: "asc" }, { name: "asc" }]
  });

  return toCatalogRecord(catalog, offerings);
}

export async function saveOfferingCatalog(
  workspaceId: string,
  input: OfferingCatalogInput,
  options: SaveOfferingCatalogOptions = {}
): Promise<OfferingCatalogRecord> {
  const sourceType = options.sourceType ?? "OWNER";
  const canonical = await saveCanonicalCatalog(workspaceId, input, sourceType, options.sourceRef);

  if (canonical.needsProjection) {
    try {
      await upsertVaultSection(workspaceId, "PRODUCTS", {
        entries: projectionEntries(canonical.catalog, canonical.offerings)
      });
      await prisma.offeringCatalog.update({
        where: { id: canonical.catalog.id },
        data: {
          projectionStatus: "READY",
          projectedVersion: canonical.catalog.version
        }
      });
    } catch (error) {
      await prisma.offeringCatalog
        .update({
          where: { id: canonical.catalog.id },
          data: { projectionStatus: "FAILED" }
        })
        .catch(() => undefined);
      throw error;
    }
  }

  const saved = await getOfferingCatalog(workspaceId);
  if (saved === null) throw new Error("Offering catalog was not found after save");
  return saved;
}

async function saveCanonicalCatalog(
  workspaceId: string,
  input: OfferingCatalogInput,
  sourceType: OfferingSourceType,
  sourceRef: string | undefined
): Promise<CanonicalSaveResult> {
  return prisma.$transaction(async (tx) => {
    const existingCatalog = await tx.offeringCatalog.findUnique({ where: { workspaceId } });
    const catalog =
      existingCatalog === null
        ? await tx.offeringCatalog.create({
            data: {
              workspaceId,
              ...(input.summary === undefined ? {} : { summary: input.summary }),
              differentiators: input.differentiators ?? [],
              ...(input.priceRange === undefined ? {} : { priceRange: input.priceRange }),
              salesChannels: input.salesChannels ?? [],
              sourceType
            }
          })
        : existingCatalog;
    const existingOfferings = await tx.offering.findMany({
      where: { workspaceId, catalogId: catalog.id, deletedAt: null }
    });
    const catalogFieldsChanged =
      existingCatalog === null ||
      (input.summary !== undefined && input.summary !== existingCatalog.summary) ||
      (input.differentiators !== undefined && !sameStrings(input.differentiators, existingCatalog.differentiators)) ||
      (input.priceRange !== undefined && input.priceRange !== existingCatalog.priceRange) ||
      (input.salesChannels !== undefined && !sameStrings(input.salesChannels, existingCatalog.salesChannels));
    const offeringsChanged = input.items === undefined ? false : await reconcileOfferings(tx, catalog, existingOfferings, input.items, sourceType, sourceRef);
    const changed = catalogFieldsChanged || offeringsChanged;
    const nextCatalog =
      existingCatalog !== null && changed
        ? await tx.offeringCatalog.update({
            where: { id: catalog.id },
            data: {
              ...(input.summary === undefined ? {} : { summary: input.summary }),
              ...(input.differentiators === undefined ? {} : { differentiators: input.differentiators }),
              ...(input.priceRange === undefined ? {} : { priceRange: input.priceRange }),
              ...(input.salesChannels === undefined ? {} : { salesChannels: input.salesChannels }),
              sourceType,
              projectionStatus: "PENDING",
              version: { increment: 1 }
            }
          })
        : catalog;
    const needsProjection = changed || nextCatalog.projectionStatus !== "READY" || nextCatalog.projectedVersion !== nextCatalog.version;

    if (needsProjection) {
      await tx.knowledgeVault.updateMany({
        where: { workspaceId, section: "PRODUCTS", deletedAt: null },
        data: { deletedAt: new Date() }
      });
      if (!changed && nextCatalog.projectionStatus === "FAILED") {
        await tx.offeringCatalog.update({
          where: { id: nextCatalog.id },
          data: { projectionStatus: "PENDING" }
        });
      }
    }

    const offerings = await tx.offering.findMany({
      where: { workspaceId, catalogId: catalog.id, deletedAt: null },
      orderBy: { name: "asc" }
    });
    const revisionSnapshot = catalogSnapshot(nextCatalog, offerings);
    await tx.offeringCatalogRevision.upsert({
      where: { catalogId_version: { catalogId: nextCatalog.id, version: nextCatalog.version } },
      create: {
        workspaceId,
        catalogId: nextCatalog.id,
        version: nextCatalog.version,
        snapshot: revisionSnapshot,
        sourceType,
        ...(sourceRef === undefined ? {} : { sourceRef })
      },
      update: {}
    });

    return { catalog: nextCatalog, offerings, changed, needsProjection };
  });
}

async function reconcileOfferings(
  tx: Prisma.TransactionClient,
  catalog: OfferingCatalog,
  existing: Offering[],
  items: NonNullable<OfferingCatalogInput["items"]>,
  sourceType: OfferingSourceType,
  sourceRef: string | undefined
): Promise<boolean> {
  const existingByName = new Map(existing.map((offering) => [offering.normalizedName, offering]));
  const desiredNames = new Set(items.map((item) => normalizeOfferingName(item.name)));
  let changed = false;

  for (const item of items) {
    const normalizedName = normalizeOfferingName(item.name);
    const current = existingByName.get(normalizedName);
    const desired = {
      kind: (item.kind ?? "UNSPECIFIED") as OfferingKind,
      name: item.name.trim(),
      normalizedName,
      category: item.category?.trim() || null,
      description: item.description?.trim() || null,
      priceType: (item.priceMinor === undefined ? "UNSPECIFIED" : "FIXED") as OfferingPriceType,
      priceMinor: item.priceMinor ?? null,
      currency: item.currency,
      status: "ACTIVE" as const,
      sourceType,
      sourceRef: sourceRef ?? null
    };

    if (current === undefined) {
      const created = await tx.offering.create({
        data: { workspaceId: catalog.workspaceId, catalogId: catalog.id, ...desired }
      });
      await writeOfferingRevision(tx, created);
      changed = true;
      continue;
    }

    if (sameOffering(current, desired)) continue;

    const updated = await tx.offering.update({
      where: { id: current.id },
      data: { ...desired, version: { increment: 1 } }
    });
    await writeOfferingRevision(tx, updated);
    changed = true;
  }

  for (const current of existing) {
    if (current.status === "ARCHIVED" || desiredNames.has(current.normalizedName)) continue;
    const archived = await tx.offering.update({
      where: { id: current.id },
      data: {
        status: "ARCHIVED",
        sourceType,
        sourceRef: sourceRef ?? null,
        version: { increment: 1 }
      }
    });
    await writeOfferingRevision(tx, archived);
    changed = true;
  }

  return changed;
}

async function writeOfferingRevision(tx: Prisma.TransactionClient, offering: Offering): Promise<void> {
  await tx.offeringRevision.create({
    data: {
      workspaceId: offering.workspaceId,
      offeringId: offering.id,
      version: offering.version,
      snapshot: offeringSnapshot(offering),
      sourceType: offering.sourceType,
      ...(offering.sourceRef === null ? {} : { sourceRef: offering.sourceRef })
    }
  });
}

function projectionEntries(catalog: OfferingCatalog, offerings: Offering[]) {
  const active = offerings.filter((offering) => offering.status !== "ARCHIVED");
  const catalogValue = {
    ...(catalog.summary === null ? {} : { summary: catalog.summary }),
    items: active.map(offeringProjectionValue),
    differentiators: catalog.differentiators,
    ...(catalog.priceRange === null ? {} : { priceRange: catalog.priceRange }),
    salesChannels: catalog.salesChannels,
    catalogVersion: catalog.version
  };

  return [
    { key: "catalog", value: catalogValue },
    ...active.map((offering) => ({
      key: `offering:${offering.id}`,
      value: offeringProjectionValue(offering)
    }))
  ];
}

function offeringProjectionValue(offering: Offering) {
  return {
    id: offering.id,
    kind: offering.kind,
    name: offering.name,
    ...(offering.nameEn === null ? {} : { nameEn: offering.nameEn }),
    ...(offering.nameAr === null ? {} : { nameAr: offering.nameAr }),
    ...(offering.category === null ? {} : { category: offering.category }),
    ...(offering.description === null ? {} : { description: offering.description }),
    priceType: offering.priceType,
    ...(offering.priceMinor === null ? {} : { priceMinor: offering.priceMinor }),
    ...(offering.minPriceMinor === null ? {} : { minPriceMinor: offering.minPriceMinor }),
    ...(offering.maxPriceMinor === null ? {} : { maxPriceMinor: offering.maxPriceMinor }),
    currency: offering.currency,
    status: offering.status,
    version: offering.version
  };
}

function catalogSnapshot(catalog: OfferingCatalog, offerings: Offering[]): Prisma.InputJsonObject {
  return {
    summary: catalog.summary,
    differentiators: catalog.differentiators,
    priceRange: catalog.priceRange,
    salesChannels: catalog.salesChannels,
    offerings: offerings.map(offeringSnapshot)
  } as Prisma.InputJsonObject;
}

function offeringSnapshot(offering: Offering): Prisma.InputJsonObject {
  return {
    kind: offering.kind,
    name: offering.name,
    normalizedName: offering.normalizedName,
    nameEn: offering.nameEn,
    nameAr: offering.nameAr,
    category: offering.category,
    description: offering.description,
    priceType: offering.priceType,
    priceMinor: offering.priceMinor,
    minPriceMinor: offering.minPriceMinor,
    maxPriceMinor: offering.maxPriceMinor,
    currency: offering.currency,
    status: offering.status
  } as Prisma.InputJsonObject;
}

function sameOffering(
  current: Offering,
  desired: {
    category: string | null;
    currency: string;
    description: string | null;
    kind: OfferingKind;
    name: string;
    normalizedName: string;
    priceMinor: number | null;
    priceType: OfferingPriceType;
    sourceRef: string | null;
    sourceType: OfferingSourceType;
    status: "ACTIVE";
  }
): boolean {
  return (
    current.name === desired.name &&
    current.kind === desired.kind &&
    current.category === desired.category &&
    current.description === desired.description &&
    current.priceType === desired.priceType &&
    current.priceMinor === desired.priceMinor &&
    current.currency === desired.currency &&
    current.status === desired.status &&
    current.sourceType === desired.sourceType &&
    current.sourceRef === desired.sourceRef
  );
}

function normalizeOfferingName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function toCatalogRecord(catalog: OfferingCatalog, offerings: Offering[]): OfferingCatalogRecord {
  return {
    id: catalog.id,
    workspaceId: catalog.workspaceId,
    ...(catalog.summary === null ? {} : { summary: catalog.summary }),
    differentiators: catalog.differentiators,
    ...(catalog.priceRange === null ? {} : { priceRange: catalog.priceRange }),
    salesChannels: catalog.salesChannels,
    version: catalog.version,
    projectionStatus: catalog.projectionStatus,
    projectedVersion: catalog.projectedVersion,
    offerings: offerings.map(toOfferingRecord),
    createdAt: catalog.createdAt.toISOString(),
    updatedAt: catalog.updatedAt.toISOString()
  };
}

function toOfferingRecord(offering: Offering): OfferingRecord {
  return {
    id: offering.id,
    workspaceId: offering.workspaceId,
    catalogId: offering.catalogId,
    kind: offering.kind,
    name: offering.name,
    ...(offering.nameEn === null ? {} : { nameEn: offering.nameEn }),
    ...(offering.nameAr === null ? {} : { nameAr: offering.nameAr }),
    ...(offering.category === null ? {} : { category: offering.category }),
    ...(offering.description === null ? {} : { description: offering.description }),
    priceType: offering.priceType,
    ...(offering.priceMinor === null ? {} : { priceMinor: offering.priceMinor }),
    ...(offering.minPriceMinor === null ? {} : { minPriceMinor: offering.minPriceMinor }),
    ...(offering.maxPriceMinor === null ? {} : { maxPriceMinor: offering.maxPriceMinor }),
    currency: offering.currency,
    status: offering.status,
    version: offering.version,
    createdAt: offering.createdAt.toISOString(),
    updatedAt: offering.updatedAt.toISOString()
  };
}
