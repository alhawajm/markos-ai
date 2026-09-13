import type { Offering, OfferingCatalog, OfferingKind, OfferingPriceType, OfferingSourceType, Prisma } from "@prisma/client";
import type { OfferingCatalogRecord, OfferingRecord } from "@markos/shared-types";
import { productsOnboardingSchema, offeringMaintenanceSchema, type OfferingMaintenanceInput } from "@markos/validation";
import type { z } from "zod";
import { prisma } from "../db/prisma";
import { indexVaultEntries, lockWorkspaceKnowledge, persistVaultSection } from "../vault/vault-service";
import { KnowledgeConflictError, readStoredKnowledge, persistKnowledge, retireProfileSummary } from "../business-profile/knowledge-service";

export type OfferingCatalogInput = z.infer<typeof productsOnboardingSchema>;

export async function maintainOffering(workspaceId: string, input: OfferingMaintenanceInput): Promise<OfferingCatalogRecord> {
  const result = await prisma.$transaction(async (tx) => {
    await lockWorkspaceKnowledge(tx, workspaceId);
    const { stored } = await readStoredKnowledge(tx, workspaceId);
    if (!stored.approved) throw new KnowledgeConflictError("Complete onboarding before maintaining products and services.");
    const existing = await tx.offeringCatalog.findUnique({ where: { workspaceId } });
    if ((existing?.version ?? 0) !== input.expectedVersion) throw new KnowledgeConflictError();
    const catalog = existing ?? (await tx.offeringCatalog.create({ data: { workspaceId } }));
    const current = input.id ? await tx.offering.findFirst({ where: { workspaceId, catalogId: catalog.id, id: input.id, deletedAt: null } }) : null;
    if (input.id && !current) throw new KnowledgeConflictError("This offering is no longer available. Reload the catalog.");
    const value = input.offering;
    const normalizedName = normalizeOfferingName(value.name);
    const collision = await tx.offering.findFirst({ where: { workspaceId, normalizedName, ...(input.id ? { id: { not: input.id } } : {}) } });
    if (collision) throw new KnowledgeConflictError("An offering with this name already exists. Edit that offering or choose a different name.");
    const data = {
      ...value,
      normalizedName,
      nameEn: value.nameEn ?? null,
      nameAr: value.nameAr ?? null,
      category: value.category ?? null,
      description: value.description ?? null,
      priceMinor: value.priceMinor ?? null,
      minPriceMinor: value.minPriceMinor ?? null,
      maxPriceMinor: value.maxPriceMinor ?? null,
      sourceType: "OWNER" as const,
      sourceRef: null
    };
    const offering = current
      ? await tx.offering.update({ where: { id: current.id }, data: { ...data, version: { increment: 1 } } })
      : await tx.offering.create({ data: { ...data, workspaceId, catalogId: catalog.id } });
    await writeOfferingRevision(tx, offering);
    const updated = await tx.offeringCatalog.update({ where: { id: catalog.id }, data: { version: { increment: 1 }, projectionStatus: "PENDING" } });
    const offerings = await tx.offering.findMany({ where: { workspaceId, catalogId: catalog.id, deletedAt: null } });
    await tx.offeringCatalogRevision.create({
      data: { workspaceId, catalogId: catalog.id, version: updated.version, snapshot: catalogSnapshot(updated, offerings), sourceType: "OWNER" }
    });
    await tx.knowledgeVault.updateMany({ where: { workspaceId, section: "PRODUCTS", deletedAt: null }, data: { deletedAt: new Date() } });
    const entries = await persistVaultSection(tx, workspaceId, "PRODUCTS", { entries: projectionEntries(updated, offerings) });
    stored.summaryCurrent = false;
    await persistKnowledge(tx, workspaceId, stored);
    await retireProfileSummary(tx, workspaceId);
    return { entries, catalog: updated };
  });
  await prisma.offeringCatalog.updateMany({
    where: { workspaceId, id: result.catalog.id, version: result.catalog.version },
    data: { projectedVersion: result.catalog.version }
  });
  return (await getOfferingCatalog(workspaceId))!;
}

interface SaveOfferingCatalogOptions {
  indexImmediately?: boolean;
  sourceRef?: string;
  sourceType?: OfferingSourceType;
}

interface CanonicalSaveResult {
  catalog: OfferingCatalog;
  changed: boolean;
  needsProjection: boolean;
  offerings: Offering[];
  projectedEntries: import("@markos/shared-types").KnowledgeVaultEntry[];
}

export async function getOfferingCatalog(workspaceId: string, client: Prisma.TransactionClient = prisma): Promise<OfferingCatalogRecord | null> {
  const catalog = await client.offeringCatalog.findFirst({
    where: { workspaceId, deletedAt: null }
  });

  if (catalog === null) return null;

  const offerings = await client.offering.findMany({
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

  if (canonical.needsProjection && options.indexImmediately !== false) {
    const indexed = await indexVaultEntries(canonical.projectedEntries);
    await prisma.offeringCatalog.updateMany({
      where: { id: canonical.catalog.id, workspaceId, version: canonical.catalog.version },
      data: { projectionStatus: indexed ? "READY" : "FAILED", projectedVersion: canonical.catalog.version }
    });
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
    await lockWorkspaceKnowledge(tx, workspaceId);
    const existingCatalog = await tx.offeringCatalog.findUnique({ where: { workspaceId } });
    if (input.expectedVersion !== undefined && input.expectedVersion !== (existingCatalog?.version ?? 0)) throw new KnowledgeConflictError();
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

    const projectedEntries = needsProjection
      ? await persistVaultSection(tx, workspaceId, "PRODUCTS", { entries: projectionEntries(nextCatalog, offerings) })
      : [];
    if (changed) {
      const { stored } = await readStoredKnowledge(tx, workspaceId);
      stored.summaryCurrent = false;
      await persistKnowledge(tx, workspaceId, stored);
      await retireProfileSummary(tx, workspaceId);
    }
    return { catalog: nextCatalog, offerings, changed, needsProjection, projectedEntries };
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
  const existingById = new Map(existing.map((offering) => [offering.id, offering]));
  const desiredIds = new Set(items.map((item) => item.id).filter(Boolean));
  let changed = false;

  for (const item of items) {
    const normalizedName = normalizeOfferingName(item.name);
    const current = item.id ? existingById.get(item.id) : undefined;
    if (item.id && (!current || (item.version !== undefined && current.version !== item.version))) throw new KnowledgeConflictError();
    if (existing.some((other) => other.normalizedName === normalizedName && other.id !== current?.id))
      throw new KnowledgeConflictError("An offering with this name already exists. Open that offering to edit it, or choose a different name.");
    const desired = {
      kind: (item.kind ?? current?.kind ?? "UNSPECIFIED") as OfferingKind,
      name: item.name,
      normalizedName,
      category: item.category ?? current?.category ?? null,
      description: item.description ?? current?.description ?? null,
      priceType: (item.priceType ?? (item.priceMinor === undefined ? (current?.priceType ?? "UNSPECIFIED") : "FIXED")) as OfferingPriceType,
      priceMinor: item.priceMinor ?? current?.priceMinor ?? null,
      currency: item.currency,
      status: item.status ?? current?.status ?? "ACTIVE",
      nameEn: item.nameEn ?? current?.nameEn ?? null,
      nameAr: item.nameAr ?? current?.nameAr ?? null,
      minPriceMinor: item.minPriceMinor ?? current?.minPriceMinor ?? null,
      maxPriceMinor: item.maxPriceMinor ?? current?.maxPriceMinor ?? null,
      sourceType,
      sourceRef: sourceRef ?? null
    };

    if (!["FIXED", "FROM"].includes(desired.priceType)) desired.priceMinor = null;
    if (desired.priceType !== "RANGE") {
      desired.minPriceMinor = null;
      desired.maxPriceMinor = null;
    }
    const { normalizedName: _normalizedName, sourceType: _sourceType, sourceRef: _sourceRef, ...ownerFields } = desired;
    const checked = offeringMaintenanceSchema.shape.offering.safeParse(Object.fromEntries(Object.entries(ownerFields).filter(([, value]) => value !== null)));
    if (!checked.success)
      throw Object.assign(new Error(checked.error.issues.map((issue) => issue.message).join("; ")), { statusCode: 400, code: "VALIDATION_ERROR" });

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
    if (current.status === "ARCHIVED" || desiredIds.has(current.id)) continue;
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
  const active = offerings.filter((offering) => offering.status === "ACTIVE");
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
    status: Offering["status"];
    nameEn: string | null;
    nameAr: string | null;
    minPriceMinor: number | null;
    maxPriceMinor: number | null;
  }
): boolean {
  return (
    current.nameEn === desired.nameEn &&
    current.nameAr === desired.nameAr &&
    current.minPriceMinor === desired.minPriceMinor &&
    current.maxPriceMinor === desired.maxPriceMinor &&
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
