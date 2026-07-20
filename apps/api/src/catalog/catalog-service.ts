import type { Offer, Product, Prisma } from "@prisma/client";
import type { OfferRecord, ProductRecord, VaultRagChunk } from "@markos/shared-types";
import type {
  CatalogOfferListQueryInput,
  CatalogProductListQueryInput,
  CreateCatalogOfferInput,
  CreateCatalogProductInput,
  UpdateCatalogOfferInput,
  UpdateCatalogProductInput
} from "@markos/validation";
import { prisma } from "../db/prisma";
import { upsertVaultSectionInTransaction } from "../vault/vault-service";

export class CatalogProductNotFoundError extends Error {
  constructor() {
    super("Product was not found");
  }
}

export class CatalogOfferNotFoundError extends Error {
  constructor() {
    super("Offer was not found");
  }
}

export class CatalogMediaAssetNotFoundError extends Error {
  constructor() {
    super("One or more media assets were not found in this workspace");
  }
}

export class CatalogOfferInvalidError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class CatalogSelectionNotFoundError extends Error {
  constructor() {
    super("Selected product or offer was not found in this workspace");
  }
}

export class CatalogSelectionInvalidError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class CatalogGenerationGuardrailError extends Error {
  constructor(message: string, readonly details: Array<Record<string, unknown>> = []) {
    super(message);
  }
}

interface CatalogGenerationContextOptions {
  limit?: number;
  offerId?: string;
  productId?: string;
}

interface CatalogCommercialBriefInput {
  catalogContext: VaultRagChunk[];
  offerId?: string;
  productId?: string;
  requestText: string;
  vaultContext: VaultRagChunk[];
}

export async function listCatalogProducts(workspaceId: string, input: CatalogProductListQueryInput): Promise<ProductRecord[]> {
  const where: Prisma.ProductWhereInput = {
    workspaceId,
    deletedAt: null,
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.category === undefined ? {} : { category: input.category }),
    ...(input.q === undefined
      ? {}
      : {
          OR: [
            { name: { contains: input.q, mode: "insensitive" } },
            { description: { contains: input.q, mode: "insensitive" } },
            { category: { contains: input.q, mode: "insensitive" } }
          ]
        })
  };
  const rows = await prisma.product.findMany({
    where,
    orderBy: {
      updatedAt: "desc"
    },
    take: 100
  });

  return rows.map(toProductRecord);
}

export async function createCatalogProduct(workspaceId: string, input: CreateCatalogProductInput): Promise<ProductRecord> {
  await assertMediaAssetsInWorkspace(workspaceId, input.mediaAssetIds);

  const row = await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        workspaceId,
        name: input.name,
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.category === undefined ? {} : { category: input.category }),
        ...(input.priceMinor === undefined ? {} : { priceMinor: input.priceMinor }),
        currency: input.currency,
        salesChannels: normalizeStringArray(input.salesChannels),
        benefits: normalizeStringArray(input.benefits),
        mediaAssetIds: unique(input.mediaAssetIds),
        status: input.status
      }
    });

    await syncProductToVault(tx, product);

    return product;
  });

  return toProductRecord(row);
}

export async function updateCatalogProduct(
  workspaceId: string,
  productId: string,
  input: UpdateCatalogProductInput
): Promise<ProductRecord> {
  const current = await prisma.product.findFirst({
    where: {
      id: productId,
      workspaceId,
      deletedAt: null
    }
  });

  if (!current) {
    throw new CatalogProductNotFoundError();
  }

  if (input.mediaAssetIds !== undefined) {
    await assertMediaAssetsInWorkspace(workspaceId, input.mediaAssetIds);
  }

  const row = await prisma.$transaction(async (tx) => {
    const product = await tx.product.update({
      where: {
        id: current.id
      },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.category === undefined ? {} : { category: input.category }),
        ...(input.priceMinor === undefined ? {} : { priceMinor: input.priceMinor }),
        ...(input.currency === undefined ? {} : { currency: input.currency }),
        ...(input.salesChannels === undefined ? {} : { salesChannels: normalizeStringArray(input.salesChannels) }),
        ...(input.benefits === undefined ? {} : { benefits: normalizeStringArray(input.benefits) }),
        ...(input.mediaAssetIds === undefined ? {} : { mediaAssetIds: unique(input.mediaAssetIds) }),
        ...(input.status === undefined ? {} : { status: input.status })
      }
    });

    await syncProductToVault(tx, product);

    return product;
  });

  return toProductRecord(row);
}

export async function archiveCatalogProduct(workspaceId: string, productId: string): Promise<ProductRecord> {
  const current = await prisma.product.findFirst({
    where: {
      id: productId,
      workspaceId,
      deletedAt: null
    }
  });

  if (!current) {
    throw new CatalogProductNotFoundError();
  }

  const row = await prisma.$transaction(async (tx) => {
    const product = await tx.product.update({
      where: {
        id: current.id
      },
      data: {
        status: "ARCHIVED"
      }
    });

    await tx.offer.updateMany({
      where: {
        workspaceId,
        productId: current.id,
        deletedAt: null
      },
      data: {
        status: "ARCHIVED"
      }
    });

    const archivedOffers = await tx.offer.findMany({
      where: {
        workspaceId,
        productId: current.id,
        deletedAt: null
      }
    });

    await syncProductToVault(tx, product);
    for (const offer of archivedOffers) {
      await syncOfferToVault(tx, offer);
    }

    return product;
  });

  return toProductRecord(row);
}

export async function listCatalogOffers(workspaceId: string, input: CatalogOfferListQueryInput): Promise<OfferRecord[]> {
  const where: Prisma.OfferWhereInput = {
    workspaceId,
    deletedAt: null,
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.productId === undefined ? {} : { productId: input.productId }),
    ...(input.q === undefined
      ? {}
      : {
          OR: [
            { title: { contains: input.q, mode: "insensitive" } },
            { description: { contains: input.q, mode: "insensitive" } },
            { terms: { contains: input.q, mode: "insensitive" } }
          ]
        })
  };
  const rows = await prisma.offer.findMany({
    where,
    orderBy: {
      updatedAt: "desc"
    },
    take: 100
  });

  return rows.map(toOfferRecord);
}

export async function createCatalogOffer(workspaceId: string, input: CreateCatalogOfferInput): Promise<OfferRecord> {
  await assertOfferProductInWorkspace(workspaceId, input.productId);

  const row = await prisma.$transaction(async (tx) => {
    const offer = await tx.offer.create({
      data: {
        workspaceId,
        ...(input.productId === undefined ? {} : { productId: input.productId }),
        title: input.title,
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.priceMinor === undefined ? {} : { priceMinor: input.priceMinor }),
        ...(input.compareAtPriceMinor === undefined ? {} : { compareAtPriceMinor: input.compareAtPriceMinor }),
        currency: input.currency,
        ...(input.startsAt === undefined ? {} : { startsAt: new Date(input.startsAt) }),
        ...(input.endsAt === undefined ? {} : { endsAt: new Date(input.endsAt) }),
        ...(input.terms === undefined ? {} : { terms: input.terms }),
        status: input.status
      }
    });

    await syncOfferToVault(tx, offer);

    return offer;
  });

  return toOfferRecord(row);
}

export async function updateCatalogOffer(
  workspaceId: string,
  offerId: string,
  input: UpdateCatalogOfferInput
): Promise<OfferRecord> {
  const current = await prisma.offer.findFirst({
    where: {
      id: offerId,
      workspaceId,
      deletedAt: null
    }
  });

  if (!current) {
    throw new CatalogOfferNotFoundError();
  }

  if (input.productId !== undefined && input.productId !== null) {
    await assertOfferProductInWorkspace(workspaceId, input.productId);
  }

  assertResolvedOfferValidity(current, input);

  const row = await prisma.$transaction(async (tx) => {
    const offer = await tx.offer.update({
      where: {
        id: current.id
      },
      data: {
        ...(input.productId === undefined ? {} : { productId: input.productId }),
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.priceMinor === undefined ? {} : { priceMinor: input.priceMinor }),
        ...(input.compareAtPriceMinor === undefined ? {} : { compareAtPriceMinor: input.compareAtPriceMinor }),
        ...(input.currency === undefined ? {} : { currency: input.currency }),
        ...(input.startsAt === undefined ? {} : { startsAt: input.startsAt === null ? null : new Date(input.startsAt) }),
        ...(input.endsAt === undefined ? {} : { endsAt: input.endsAt === null ? null : new Date(input.endsAt) }),
        ...(input.terms === undefined ? {} : { terms: input.terms }),
        ...(input.status === undefined ? {} : { status: input.status })
      }
    });

    await syncOfferToVault(tx, offer);

    return offer;
  });

  return toOfferRecord(row);
}

export async function archiveCatalogOffer(workspaceId: string, offerId: string): Promise<OfferRecord> {
  const current = await prisma.offer.findFirst({
    where: {
      id: offerId,
      workspaceId,
      deletedAt: null
    }
  });

  if (!current) {
    throw new CatalogOfferNotFoundError();
  }

  const row = await prisma.$transaction(async (tx) => {
    const offer = await tx.offer.update({
      where: {
        id: current.id
      },
      data: {
        status: "ARCHIVED"
      }
    });

    await syncOfferToVault(tx, offer);

    return offer;
  });

  return toOfferRecord(row);
}

export async function listCatalogGenerationContext(
  workspaceId: string,
  input: CatalogGenerationContextOptions | number = {}
): Promise<VaultRagChunk[]> {
  const options = typeof input === "number" ? { limit: input } : input;
  const limit = options.limit ?? 8;
  const now = new Date();
  const selectedChunks: VaultRagChunk[] = [];
  let selectedProduct: Product | null = null;
  let selectedOffer: Offer | null = null;

  if (options.productId !== undefined) {
    selectedProduct = await prisma.product.findFirst({
      where: activeProductWhere(workspaceId, options.productId)
    });

    if (!selectedProduct) {
      throw new CatalogSelectionNotFoundError();
    }
  }

  if (options.offerId !== undefined) {
    selectedOffer = await prisma.offer.findFirst({
      where: activeOfferWhere(workspaceId, now, options.offerId)
    });

    if (!selectedOffer) {
      throw new CatalogSelectionNotFoundError();
    }
  }

  if (selectedProduct && selectedOffer?.productId && selectedOffer.productId !== selectedProduct.id) {
    throw new CatalogSelectionInvalidError("Selected offer belongs to a different product");
  }

  if (!selectedProduct && selectedOffer?.productId) {
    selectedProduct = await prisma.product.findFirst({
      where: activeProductWhere(workspaceId, selectedOffer.productId)
    });

    if (!selectedProduct) {
      throw new CatalogSelectionInvalidError("Selected offer is linked to an inactive or missing product");
    }
  }

  if (selectedProduct) {
    selectedChunks.push(
      productToContextChunk(selectedProduct, {
        selectedForGeneration: true,
        selectionRole: options.productId === undefined ? "linked_offer_product" : "selected_product"
      })
    );
  }

  if (selectedOffer) {
    selectedChunks.push(
      offerToContextChunk(selectedOffer, {
        selectedForGeneration: true,
        selectionRole: "selected_offer"
      })
    );
  }

  const [products, offers] = await Promise.all([
    prisma.product.findMany({
      where: activeProductWhere(workspaceId),
      orderBy: {
        updatedAt: "desc"
      },
      take: Math.ceil(limit / 2)
    }),
    prisma.offer.findMany({
      where: activeOfferWhere(workspaceId, now),
      orderBy: {
        updatedAt: "desc"
      },
      take: Math.floor(limit / 2)
    })
  ]);

  return dedupeCatalogContext(
    [...selectedChunks, ...products.map((product) => productToContextChunk(product)), ...offers.map((offer) => offerToContextChunk(offer))],
    limit
  );
}

export function buildCatalogCommercialBrief(input: CatalogCommercialBriefInput): VaultRagChunk[] {
  const selectedProduct = input.catalogContext.find((chunk) => chunk.value.sourceType === "product" && chunk.value.selectedForGeneration === true);
  const selectedOffer = input.catalogContext.find((chunk) => chunk.value.sourceType === "offer" && chunk.value.selectedForGeneration === true);
  const activeProducts = input.catalogContext.filter((chunk) => chunk.value.sourceType === "product");
  const activeOffers = input.catalogContext.filter((chunk) => chunk.value.sourceType === "offer");

  if (activeProducts.length === 0 && activeOffers.length === 0) {
    return [];
  }

  assertCommercialGuardrails({
    requestText: input.requestText,
    vaultContext: input.vaultContext,
    ...(selectedOffer === undefined ? {} : { selectedOffer }),
    ...(selectedProduct === undefined ? {} : { selectedProduct })
  });

  const audienceSignals = extractAudienceSignals(input.vaultContext);
  const approvedEvidence = extractApprovedEvidence(input.vaultContext);
  const angleProduct = selectedProduct ?? activeProducts[0];
  const campaignAngles = buildCampaignAngles({
    audienceSignals,
    approvedEvidence,
    ...(angleProduct === undefined ? {} : { product: angleProduct }),
    ...(selectedOffer === undefined ? {} : { offer: selectedOffer })
  });

  return [
    {
      id: "catalog:commercial-brief",
      key: "catalog:commercial-brief",
      section: "PRODUCTS",
      value: compactObject({
        source: "markos",
        sourceType: "commercial_brief",
        requestText: input.requestText,
        selectedProduct: selectedProduct === undefined ? undefined : commercialProductSummary(selectedProduct),
        selectedOffer: selectedOffer === undefined ? undefined : commercialOfferSummary(selectedOffer),
        audienceSignals,
        approvedEvidence,
        campaignAngles,
        guardrails: {
          doNotInventPrices: true,
          doNotInventComparativeClaims: true,
          allowedPriceSources: ["selected product price", "selected offer price", "explicit user request price"],
          allowedClaimSources: ["catalog benefits", "approved Vault facts"]
        }
      }),
      version: 1,
      score: 1
    }
  ];
}

export function toProductRecord(row: Product): ProductRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    ...(row.description === null ? {} : { description: row.description }),
    ...(row.category === null ? {} : { category: row.category }),
    ...(row.priceMinor === null ? {} : { priceMinor: row.priceMinor }),
    currency: row.currency,
    salesChannels: row.salesChannels,
    benefits: row.benefits,
    mediaAssetIds: row.mediaAssetIds,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export function toOfferRecord(row: Offer): OfferRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    ...(row.productId === null ? {} : { productId: row.productId }),
    title: row.title,
    ...(row.description === null ? {} : { description: row.description }),
    ...(row.priceMinor === null ? {} : { priceMinor: row.priceMinor }),
    ...(row.compareAtPriceMinor === null ? {} : { compareAtPriceMinor: row.compareAtPriceMinor }),
    currency: row.currency,
    ...(row.startsAt === null ? {} : { startsAt: row.startsAt.toISOString() }),
    ...(row.endsAt === null ? {} : { endsAt: row.endsAt.toISOString() }),
    ...(row.terms === null ? {} : { terms: row.terms }),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

async function assertMediaAssetsInWorkspace(workspaceId: string, mediaAssetIds: string[]): Promise<void> {
  const ids = unique(mediaAssetIds);

  if (ids.length === 0) {
    return;
  }

  const count = await prisma.mediaAsset.count({
    where: {
      id: {
        in: ids
      },
      workspaceId,
      deletedAt: null
    }
  });

  if (count !== ids.length) {
    throw new CatalogMediaAssetNotFoundError();
  }
}

async function assertOfferProductInWorkspace(workspaceId: string, productId: string | undefined): Promise<void> {
  if (productId === undefined) {
    return;
  }

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      workspaceId,
      deletedAt: null,
      status: "ACTIVE"
    },
    select: {
      id: true
    }
  });

  if (!product) {
    throw new CatalogProductNotFoundError();
  }
}

function assertResolvedOfferValidity(current: Offer, input: UpdateCatalogOfferInput): void {
  const priceMinor = input.priceMinor === undefined ? current.priceMinor : input.priceMinor;
  const compareAtPriceMinor = input.compareAtPriceMinor === undefined ? current.compareAtPriceMinor : input.compareAtPriceMinor;

  if (priceMinor !== null && compareAtPriceMinor !== null && compareAtPriceMinor < priceMinor) {
    throw new CatalogOfferInvalidError("Compare-at price must be greater than or equal to offer price");
  }

  const startsAt = input.startsAt === undefined ? current.startsAt : input.startsAt === null ? null : new Date(input.startsAt);
  const endsAt = input.endsAt === undefined ? current.endsAt : input.endsAt === null ? null : new Date(input.endsAt);

  if (startsAt !== null && endsAt !== null && endsAt <= startsAt) {
    throw new CatalogOfferInvalidError("Offer end date must be after start date");
  }
}

async function syncProductToVault(tx: Prisma.TransactionClient, product: Product): Promise<void> {
  await upsertVaultSectionInTransaction(tx, product.workspaceId, "PRODUCTS", {
    entries: [
      {
        key: catalogProductVaultKey(product.id),
        value: productToVaultValue(product)
      }
    ]
  });
}

async function syncOfferToVault(tx: Prisma.TransactionClient, offer: Offer): Promise<void> {
  await upsertVaultSectionInTransaction(tx, offer.workspaceId, "PRODUCTS", {
    entries: [
      {
        key: catalogOfferVaultKey(offer.id),
        value: offerToVaultValue(offer)
      }
    ]
  });
}

function activeProductWhere(workspaceId: string, productId?: string): Prisma.ProductWhereInput {
  return {
    workspaceId,
    deletedAt: null,
    status: "ACTIVE",
    ...(productId === undefined ? {} : { id: productId })
  };
}

function activeOfferWhere(workspaceId: string, now: Date, offerId?: string): Prisma.OfferWhereInput {
  return {
    workspaceId,
    deletedAt: null,
    status: "ACTIVE",
    ...(offerId === undefined ? {} : { id: offerId }),
    OR: [
      {
        endsAt: null
      },
      {
        endsAt: {
          gt: now
        }
      }
    ]
  };
}

function dedupeCatalogContext(chunks: VaultRagChunk[], limit: number): VaultRagChunk[] {
  const seen = new Set<string>();
  const deduped: VaultRagChunk[] = [];

  for (const chunk of chunks) {
    const key = `${chunk.section}:${chunk.key}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(chunk);
  }

  return deduped.slice(0, limit);
}

function productToContextChunk(product: Product, annotations: Record<string, unknown> = {}): VaultRagChunk {
  return {
    id: catalogProductVaultKey(product.id),
    section: "PRODUCTS",
    key: catalogProductVaultKey(product.id),
    value: compactObject({
      ...productToVaultValue(product),
      ...annotations
    }),
    version: 1,
    score: 1
  };
}

function offerToContextChunk(offer: Offer, annotations: Record<string, unknown> = {}): VaultRagChunk {
  return {
    id: catalogOfferVaultKey(offer.id),
    section: "PRODUCTS",
    key: catalogOfferVaultKey(offer.id),
    value: compactObject({
      ...offerToVaultValue(offer),
      ...annotations
    }),
    version: 1,
    score: 1
  };
}

function productToVaultValue(product: Product): Record<string, unknown> {
  return compactObject({
    source: "catalog",
    sourceType: "product",
    productId: product.id,
    name: product.name,
    description: product.description ?? undefined,
    category: product.category ?? undefined,
    priceMinor: product.priceMinor ?? undefined,
    currency: product.currency,
    salesChannels: product.salesChannels,
    benefits: product.benefits,
    mediaAssetIds: product.mediaAssetIds,
    status: product.status
  });
}

function offerToVaultValue(offer: Offer): Record<string, unknown> {
  return compactObject({
    source: "catalog",
    sourceType: "offer",
    offerId: offer.id,
    productId: offer.productId ?? undefined,
    title: offer.title,
    description: offer.description ?? undefined,
    priceMinor: offer.priceMinor ?? undefined,
    compareAtPriceMinor: offer.compareAtPriceMinor ?? undefined,
    currency: offer.currency,
    startsAt: offer.startsAt?.toISOString(),
    endsAt: offer.endsAt?.toISOString(),
    terms: offer.terms ?? undefined,
    status: offer.status
  });
}

function assertCommercialGuardrails(input: {
  requestText: string;
  selectedOffer?: VaultRagChunk;
  selectedProduct?: VaultRagChunk;
  vaultContext: VaultRagChunk[];
}): void {
  const requestText = input.requestText.trim();
  const details: Array<Record<string, unknown>> = [];
  const selectedPriceMinor = firstNumber(input.selectedOffer?.value.priceMinor, input.selectedProduct?.value.priceMinor);

  if (requestsPrice(requestText) && selectedPriceMinor === undefined && !containsExplicitPrice(requestText)) {
    details.push({
      issue: "missing_price",
      message: "The request asks for price, discount, or deal language, but the selected catalog context does not include a price."
    });
  }

  const unsupportedClaims = unsupportedClaimTerms(requestText, [
    input.selectedProduct?.value,
    input.selectedOffer?.value,
    ...input.vaultContext.map((chunk) => chunk.value)
  ]);

  if (unsupportedClaims.length > 0) {
    details.push({
      issue: "unsupported_claim",
      claims: unsupportedClaims,
      message: "The request contains comparative or proof claims that are not present in catalog benefits or approved Vault facts."
    });
  }

  if (details.length > 0) {
    throw new CatalogGenerationGuardrailError("Commercial generation request needs approved product, price, or claim evidence before MARKOS can generate it.", details);
  }
}

function buildCampaignAngles(input: {
  audienceSignals: string[];
  approvedEvidence: string[];
  offer?: VaultRagChunk;
  product?: VaultRagChunk;
}): string[] {
  const productName = stringValue(input.product?.value.name) ?? "selected product";
  const offerTitle = stringValue(input.offer?.value.title);
  const audience = input.audienceSignals[0] ?? "the priority Instagram audience";
  const evidence = input.approvedEvidence[0];
  const benefits = stringArrayValue(input.product?.value.benefits).slice(0, 4);
  const angles = benefits.map((benefit) => `Connect ${productName} to ${audience} through "${benefit}".`);

  if (offerTitle !== undefined) {
    angles.unshift(`Lead with "${offerTitle}" as the campaign hook and keep the call to action tied to the offer terms.`);
  }

  if (evidence !== undefined) {
    angles.push(`Use approved Vault proof: ${evidence}.`);
  }

  return unique(angles).slice(0, 6);
}

function commercialProductSummary(chunk: VaultRagChunk): Record<string, unknown> {
  return compactObject({
    productId: chunk.value.productId,
    name: chunk.value.name,
    category: chunk.value.category,
    priceMinor: chunk.value.priceMinor,
    currency: chunk.value.currency,
    benefits: chunk.value.benefits,
    salesChannels: chunk.value.salesChannels
  });
}

function commercialOfferSummary(chunk: VaultRagChunk): Record<string, unknown> {
  return compactObject({
    offerId: chunk.value.offerId,
    productId: chunk.value.productId,
    title: chunk.value.title,
    description: chunk.value.description,
    priceMinor: chunk.value.priceMinor,
    compareAtPriceMinor: chunk.value.compareAtPriceMinor,
    currency: chunk.value.currency,
    startsAt: chunk.value.startsAt,
    endsAt: chunk.value.endsAt,
    terms: chunk.value.terms
  });
}

function extractAudienceSignals(context: VaultRagChunk[]): string[] {
  const signals = context
    .filter((chunk) => chunk.section === "AUDIENCE")
    .flatMap((chunk) => flattenStrings(chunk.value))
    .map(cleanSignal)
    .filter((value) => value.length >= 3);

  return unique(signals).slice(0, 6);
}

function extractApprovedEvidence(context: VaultRagChunk[]): string[] {
  const signals = context
    .filter((chunk) => chunk.section !== "PRODUCTS")
    .flatMap((chunk) => flattenStrings(chunk.value))
    .map(cleanSignal)
    .filter((value) => value.length >= 6);

  return unique(signals).slice(0, 6);
}

function flattenStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenStrings(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap((item) => flattenStrings(item));
  }

  return [];
}

function cleanSignal(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

function requestsPrice(value: string): boolean {
  return /\b(price|pricing|cost|rate|discount|sale|deal|promo|promotion|bhd|bd)\b|%\s*off|\bخصم\b|\bسعر\b/i.test(value);
}

function containsExplicitPrice(value: string): boolean {
  return /\b(?:bhd|bd)\s*\d+(?:[.,]\d{1,3})?\b|\b\d+(?:[.,]\d{1,3})?\s*(?:bhd|bd)\b|\b\d{1,3}\s*%/i.test(value);
}

function unsupportedClaimTerms(requestText: string, evidenceValues: Array<Record<string, unknown> | undefined>): string[] {
  const text = requestText.toLowerCase();
  const evidence = evidenceValues
    .filter((value): value is Record<string, unknown> => value !== undefined)
    .flatMap((value) => flattenStrings(value))
    .join(" ")
    .toLowerCase();
  const terms = [
    "best",
    "number one",
    "#1",
    "leading",
    "fastest",
    "highest",
    "lowest",
    "guaranteed",
    "proven",
    "certified",
    "award-winning",
    "exclusive",
    "only"
  ];

  return terms.filter((term) => text.includes(term) && !evidence.includes(term));
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number") {
      return value;
    }
  }

  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function catalogProductVaultKey(productId: string): string {
  return `catalog:product:${productId}`;
}

function catalogOfferVaultKey(offerId: string): string {
  return `catalog:offer:${offerId}`;
}

function compactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));
}

function normalizeStringArray(values: string[]): string[] {
  return unique(values.map((value) => value.trim()).filter(Boolean));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
