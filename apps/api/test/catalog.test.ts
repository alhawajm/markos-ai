import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

describe("catalog routes", () => {
  it("creates, filters, updates, and archives workspace products", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app, "catalog-product");
    const headers = authHeaders(session.tokens.accessToken);
    const mediaAsset = await createMediaAsset(session.workspace.id);

    const create = await app.inject({
      method: "POST",
      url: "/v1/catalog/products",
      headers,
      payload: {
        benefits: ["Handcrafted pieces", "Premium packaging"],
        category: "Jewelry",
        currency: "BHD",
        description: "Luxury jewelry collection for Ramadan gifting.",
        mediaAssetIds: [mediaAsset.id],
        name: "Luxury Jewelry Collection",
        priceMinor: 45000,
        salesChannels: ["Instagram", "Website"]
      }
    });
    const product = create.json().data;
    const list = await app.inject({
      method: "GET",
      url: "/v1/catalog/products?status=ACTIVE&category=Jewelry&q=luxury",
      headers
    });
    const update = await app.inject({
      method: "PATCH",
      url: `/v1/catalog/products/${product.id}`,
      headers,
      payload: {
        benefits: ["Handcrafted Bahraini pieces"],
        priceMinor: 39900,
        salesChannels: ["Instagram"]
      }
    });
    const archive = await app.inject({
      method: "DELETE",
      url: `/v1/catalog/products/${product.id}`,
      headers
    });
    const archivedList = await app.inject({
      method: "GET",
      url: "/v1/catalog/products?status=ARCHIVED",
      headers
    });

    expect(create.statusCode).toBe(200);
    expect(product).toMatchObject({
      workspaceId: session.workspace.id,
      name: "Luxury Jewelry Collection",
      category: "Jewelry",
      priceMinor: 45000,
      currency: "BHD",
      benefits: ["Handcrafted pieces", "Premium packaging"],
      mediaAssetIds: [mediaAsset.id],
      salesChannels: ["Instagram", "Website"],
      status: "ACTIVE"
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toEqual([expect.objectContaining({ id: product.id })]);
    expect(update.statusCode).toBe(200);
    expect(update.json().data).toMatchObject({
      id: product.id,
      benefits: ["Handcrafted Bahraini pieces"],
      priceMinor: 39900,
      salesChannels: ["Instagram"]
    });
    expect(archive.statusCode).toBe(200);
    expect(archive.json().data).toMatchObject({
      id: product.id,
      status: "ARCHIVED"
    });
    expect(archivedList.statusCode).toBe(200);
    expect(archivedList.json().data).toEqual([expect.objectContaining({ id: product.id, status: "ARCHIVED" })]);
    const productVault = await prisma.knowledgeVault.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id,
        section: "PRODUCTS",
        key: `catalog:product:${product.id}`
      }
    });
    const productHistory = await prisma.knowledgeVaultHistory.findMany({
      where: {
        workspaceId: session.workspace.id,
        section: "PRODUCTS",
        key: `catalog:product:${product.id}`
      },
      orderBy: {
        version: "asc"
      }
    });
    expect(productVault).toMatchObject({
      version: 3
    });
    expect(productVault.value).toMatchObject({
      source: "catalog",
      sourceType: "product",
      productId: product.id,
      name: "Luxury Jewelry Collection",
      category: "Jewelry",
      priceMinor: 39900,
      currency: "BHD",
      benefits: ["Handcrafted Bahraini pieces"],
      mediaAssetIds: [mediaAsset.id],
      salesChannels: ["Instagram"],
      status: "ARCHIVED"
    });
    expect(productHistory.map((entry) => entry.version)).toEqual([1, 2, 3]);

    await app.close();
  });

  it("creates, filters, updates, and archives product offers", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app, "catalog-offer");
    const headers = authHeaders(session.tokens.accessToken);
    const product = await createProduct(app, headers);

    const create = await app.inject({
      method: "POST",
      url: "/v1/catalog/offers",
      headers,
      payload: {
        compareAtPriceMinor: 45000,
        currency: "BHD",
        description: "Limited collection launch offer.",
        endsAt: "2027-01-15T20:00:00.000Z",
        priceMinor: 39900,
        productId: product.id,
        startsAt: "2027-01-01T09:00:00.000Z",
        terms: "Available while inventory lasts.",
        title: "Luxury Launch Offer"
      }
    });
    const offer = create.json().data;
    const list = await app.inject({
      method: "GET",
      url: `/v1/catalog/offers?productId=${product.id}&status=ACTIVE&q=launch`,
      headers
    });
    const update = await app.inject({
      method: "PATCH",
      url: `/v1/catalog/offers/${offer.id}`,
      headers,
      payload: {
        status: "PAUSED",
        terms: null
      }
    });
    const productArchive = await app.inject({
      method: "DELETE",
      url: `/v1/catalog/products/${product.id}`,
      headers
    });
    const archivedOffers = await app.inject({
      method: "GET",
      url: `/v1/catalog/offers?productId=${product.id}&status=ARCHIVED`,
      headers
    });

    expect(create.statusCode).toBe(200);
    expect(offer).toMatchObject({
      workspaceId: session.workspace.id,
      productId: product.id,
      title: "Luxury Launch Offer",
      priceMinor: 39900,
      compareAtPriceMinor: 45000,
      currency: "BHD",
      status: "ACTIVE",
      startsAt: "2027-01-01T09:00:00.000Z",
      endsAt: "2027-01-15T20:00:00.000Z"
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toEqual([expect.objectContaining({ id: offer.id })]);
    expect(update.statusCode).toBe(200);
    expect(update.json().data).toMatchObject({
      id: offer.id,
      status: "PAUSED"
    });
    expect(update.json().data.terms).toBeUndefined();
    expect(productArchive.statusCode).toBe(200);
    expect(archivedOffers.statusCode).toBe(200);
    expect(archivedOffers.json().data).toEqual([expect.objectContaining({ id: offer.id, status: "ARCHIVED" })]);
    const offerVault = await prisma.knowledgeVault.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id,
        section: "PRODUCTS",
        key: `catalog:offer:${offer.id}`
      }
    });
    const offerHistory = await prisma.knowledgeVaultHistory.findMany({
      where: {
        workspaceId: session.workspace.id,
        section: "PRODUCTS",
        key: `catalog:offer:${offer.id}`
      },
      orderBy: {
        version: "asc"
      }
    });
    expect(offerVault).toMatchObject({
      version: 3
    });
    expect(offerVault.value).toMatchObject({
      source: "catalog",
      sourceType: "offer",
      offerId: offer.id,
      productId: product.id,
      title: "Luxury Launch Offer",
      priceMinor: 39900,
      compareAtPriceMinor: 45000,
      currency: "BHD",
      status: "ARCHIVED"
    });
    expect(offerHistory.map((entry) => entry.version)).toEqual([1, 2, 3]);

    await app.close();
  });

  it("rejects invalid offer price and date windows", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app, "catalog-invalid");
    const headers = authHeaders(session.tokens.accessToken);
    const product = await createProduct(app, headers);

    const invalidCreate = await app.inject({
      method: "POST",
      url: "/v1/catalog/offers",
      headers,
      payload: {
        compareAtPriceMinor: 20000,
        priceMinor: 30000,
        productId: product.id,
        title: "Invalid Price Offer"
      }
    });
    const validOffer = await app.inject({
      method: "POST",
      url: "/v1/catalog/offers",
      headers,
      payload: {
        endsAt: "2027-01-15T20:00:00.000Z",
        productId: product.id,
        startsAt: "2027-01-01T09:00:00.000Z",
        title: "Valid Window Offer"
      }
    });
    const invalidUpdate = await app.inject({
      method: "PATCH",
      url: `/v1/catalog/offers/${validOffer.json().data.id}`,
      headers,
      payload: {
        startsAt: "2027-01-20T09:00:00.000Z"
      }
    });

    expect(invalidCreate.statusCode).toBe(400);
    expect(invalidCreate.json().error.code).toBe("VALIDATION_ERROR");
    expect(validOffer.statusCode).toBe(200);
    expect(invalidUpdate.statusCode).toBe(409);
    expect(invalidUpdate.json().error.code).toBe("CATALOG_OFFER_INVALID");

    await app.close();
  });

  it("keeps products, offers, and media references isolated by workspace", async () => {
    const app = await buildApp();
    const owner = await registerTestUser(app, "catalog-owner");
    const other = await registerTestUser(app, "catalog-other");
    const ownerHeaders = authHeaders(owner.tokens.accessToken);
    const otherHeaders = authHeaders(other.tokens.accessToken);
    const ownerMedia = await createMediaAsset(owner.workspace.id);
    const ownerProduct = await createProduct(app, ownerHeaders, {
      mediaAssetIds: [ownerMedia.id],
      name: "Owner Scoped Product"
    });
    const otherProduct = await createProduct(app, otherHeaders, {
      name: "Other Scoped Product"
    });

    const ownerList = await app.inject({
      method: "GET",
      url: "/v1/catalog/products",
      headers: ownerHeaders
    });
    const otherList = await app.inject({
      method: "GET",
      url: "/v1/catalog/products",
      headers: otherHeaders
    });
    const crossOffer = await app.inject({
      method: "POST",
      url: "/v1/catalog/offers",
      headers: otherHeaders,
      payload: {
        productId: ownerProduct.id,
        title: "Cross Workspace Offer"
      }
    });
    const crossProductUpdate = await app.inject({
      method: "PATCH",
      url: `/v1/catalog/products/${ownerProduct.id}`,
      headers: otherHeaders,
      payload: {
        name: "Should Not Update"
      }
    });
    const crossMediaProduct = await app.inject({
      method: "POST",
      url: "/v1/catalog/products",
      headers: otherHeaders,
      payload: {
        mediaAssetIds: [ownerMedia.id],
        name: "Invalid Media Product"
      }
    });

    expect(ownerList.statusCode).toBe(200);
    expect(ownerList.json().data).toEqual([expect.objectContaining({ id: ownerProduct.id })]);
    expect(ownerList.json().data).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: otherProduct.id })]));
    expect(otherList.statusCode).toBe(200);
    expect(otherList.json().data).toEqual([expect.objectContaining({ id: otherProduct.id })]);
    expect(otherList.json().data).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: ownerProduct.id })]));
    expect(crossOffer.statusCode).toBe(404);
    expect(crossOffer.json().error.code).toBe("CATALOG_PRODUCT_NOT_FOUND");
    expect(crossProductUpdate.statusCode).toBe(404);
    expect(crossProductUpdate.json().error.code).toBe("CATALOG_PRODUCT_NOT_FOUND");
    expect(crossMediaProduct.statusCode).toBe(404);
    expect(crossMediaProduct.json().error.code).toBe("CATALOG_MEDIA_NOT_FOUND");

    await app.close();
  });
});

async function registerTestUser(app: FastifyInstance, label: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `${label}-${randomUUID()}@markos.test`,
      password: "CorrectHorseBattery99!",
      fullName: "Catalog User",
      workspaceName: `${label} Workspace ${randomUUID()}`,
      locale: "en"
    }
  });

  return response.json().data;
}

async function createProduct(app: FastifyInstance, headers: Record<string, string>, overrides: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/catalog/products",
    headers,
    payload: {
      category: "Jewelry",
      currency: "BHD",
      name: "Luxury Jewelry Collection",
      priceMinor: 45000,
      ...overrides
    }
  });

  expect(response.statusCode).toBe(200);
  return response.json().data;
}

async function createMediaAsset(workspaceId: string) {
  return prisma.mediaAsset.create({
    data: {
      cdnUrl: "https://cdn.markos.test/catalog.png",
      filename: `${randomUUID()}.png`,
      mimeType: "image/png",
      s3Key: `catalog/${randomUUID()}.png`,
      sizeBytes: 1024,
      type: "IMAGE",
      workspaceId
    },
    select: {
      id: true
    }
  });
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`
  };
}
