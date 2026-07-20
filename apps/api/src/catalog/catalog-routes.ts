import type { FastifyInstance } from "fastify";
import {
  catalogOfferListQuerySchema,
  catalogOfferParamsSchema,
  catalogProductListQuerySchema,
  catalogProductParamsSchema,
  createCatalogOfferSchema,
  createCatalogProductSchema,
  updateCatalogOfferSchema,
  updateCatalogProductSchema
} from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import {
  archiveCatalogOffer,
  archiveCatalogProduct,
  CatalogMediaAssetNotFoundError,
  CatalogOfferInvalidError,
  CatalogOfferNotFoundError,
  CatalogProductNotFoundError,
  createCatalogOffer,
  createCatalogProduct,
  listCatalogOffers,
  listCatalogProducts,
  updateCatalogOffer,
  updateCatalogProduct
} from "./catalog-service";

export async function registerCatalogRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/catalog/products",
    {
      config: {
        workspaceRequired: true,
        permissions: ["catalog:read"]
      }
    },
    async (request, reply) => {
      const parsed = catalogProductListQuerySchema.safeParse(request.query ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid product list query", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();
      return ok(await listCatalogProducts(workspaceId, parsed.data));
    }
  );

  app.post(
    "/v1/catalog/products",
    {
      config: {
        workspaceRequired: true,
        permissions: ["catalog:write"]
      }
    },
    async (request, reply) => {
      const parsed = createCatalogProductSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid product create request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await createCatalogProduct(workspaceId, parsed.data));
      } catch (error) {
        return handleCatalogError(error, reply);
      }
    }
  );

  app.patch(
    "/v1/catalog/products/:productId",
    {
      config: {
        workspaceRequired: true,
        permissions: ["catalog:write"]
      }
    },
    async (request, reply) => {
      const params = catalogProductParamsSchema.safeParse(request.params ?? {});
      const body = updateCatalogProductSchema.safeParse(request.body ?? {});

      if (!params.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid product id", params.error.issues));
      }

      if (!body.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid product update request", body.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await updateCatalogProduct(workspaceId, params.data.productId, body.data));
      } catch (error) {
        return handleCatalogError(error, reply);
      }
    }
  );

  app.delete(
    "/v1/catalog/products/:productId",
    {
      config: {
        workspaceRequired: true,
        permissions: ["catalog:write"]
      }
    },
    async (request, reply) => {
      const params = catalogProductParamsSchema.safeParse(request.params ?? {});

      if (!params.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid product id", params.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await archiveCatalogProduct(workspaceId, params.data.productId));
      } catch (error) {
        return handleCatalogError(error, reply);
      }
    }
  );

  app.get(
    "/v1/catalog/offers",
    {
      config: {
        workspaceRequired: true,
        permissions: ["catalog:read"]
      }
    },
    async (request, reply) => {
      const parsed = catalogOfferListQuerySchema.safeParse(request.query ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid offer list query", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();
      return ok(await listCatalogOffers(workspaceId, parsed.data));
    }
  );

  app.post(
    "/v1/catalog/offers",
    {
      config: {
        workspaceRequired: true,
        permissions: ["catalog:write"]
      }
    },
    async (request, reply) => {
      const parsed = createCatalogOfferSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid offer create request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await createCatalogOffer(workspaceId, parsed.data));
      } catch (error) {
        return handleCatalogError(error, reply);
      }
    }
  );

  app.patch(
    "/v1/catalog/offers/:offerId",
    {
      config: {
        workspaceRequired: true,
        permissions: ["catalog:write"]
      }
    },
    async (request, reply) => {
      const params = catalogOfferParamsSchema.safeParse(request.params ?? {});
      const body = updateCatalogOfferSchema.safeParse(request.body ?? {});

      if (!params.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid offer id", params.error.issues));
      }

      if (!body.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid offer update request", body.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await updateCatalogOffer(workspaceId, params.data.offerId, body.data));
      } catch (error) {
        return handleCatalogError(error, reply);
      }
    }
  );

  app.delete(
    "/v1/catalog/offers/:offerId",
    {
      config: {
        workspaceRequired: true,
        permissions: ["catalog:write"]
      }
    },
    async (request, reply) => {
      const params = catalogOfferParamsSchema.safeParse(request.params ?? {});

      if (!params.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid offer id", params.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await archiveCatalogOffer(workspaceId, params.data.offerId));
      } catch (error) {
        return handleCatalogError(error, reply);
      }
    }
  );
}

function handleCatalogError(error: unknown, reply: { status: (code: number) => { send: (payload: unknown) => unknown } }) {
  if (error instanceof CatalogProductNotFoundError) {
    return reply.status(404).send(errorEnvelope("CATALOG_PRODUCT_NOT_FOUND", error.message));
  }

  if (error instanceof CatalogOfferNotFoundError) {
    return reply.status(404).send(errorEnvelope("CATALOG_OFFER_NOT_FOUND", error.message));
  }

  if (error instanceof CatalogMediaAssetNotFoundError) {
    return reply.status(404).send(errorEnvelope("CATALOG_MEDIA_NOT_FOUND", error.message));
  }

  if (error instanceof CatalogOfferInvalidError) {
    return reply.status(409).send(errorEnvelope("CATALOG_OFFER_INVALID", error.message));
  }

  throw error;
}
