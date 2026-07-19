import type { FastifyInstance } from "fastify";
import { brandBookExportListQuerySchema, brandBookExportParamsSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import {
  BrandBookExportNotFoundError,
  BrandKitContextMissingError,
  createBrandBookExport,
  getBrandBookExport,
  getBrandKit,
  listBrandBookExports
} from "./brand-service";

export async function registerBrandRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/brand-kit",
    {
      config: {
        workspaceRequired: true,
        permissions: ["vault:read"]
      }
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await getBrandKit(workspaceId));
    }
  );

  app.get(
    "/v1/brand-book/exports",
    {
      config: {
        workspaceRequired: true,
        permissions: ["vault:read"]
      }
    },
    async (request, reply) => {
      const parsed = brandBookExportListQuerySchema.safeParse(request.query ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid Brand Book export query", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();
      return ok(await listBrandBookExports(workspaceId, parsed.data.limit));
    }
  );

  app.post(
    "/v1/brand-book/exports",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["vault:read"]
      }
    },
    async (_request, reply) => {
      const { userId, workspaceId } = requireWorkspaceContext();

      try {
        return ok(await createBrandBookExport(workspaceId, userId));
      } catch (error) {
        return handleBrandError(reply, error);
      }
    }
  );

  app.get(
    "/v1/brand-book/exports/:exportId",
    {
      config: {
        workspaceRequired: true,
        permissions: ["vault:read"]
      }
    },
    async (request, reply) => {
      const parsed = brandBookExportParamsSchema.safeParse(request.params ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid Brand Book export id", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await getBrandBookExport(workspaceId, parsed.data.exportId));
      } catch (error) {
        return handleBrandError(reply, error);
      }
    }
  );
}

function handleBrandError(reply: { status: (code: number) => { send: (payload: unknown) => unknown } }, error: unknown): unknown {
  if (error instanceof BrandKitContextMissingError) {
    return reply.status(409).send(errorEnvelope("BRAND_KIT_CONTEXT_MISSING", error.message));
  }

  if (error instanceof BrandBookExportNotFoundError) {
    return reply.status(404).send(errorEnvelope("BRAND_BOOK_EXPORT_NOT_FOUND", error.message));
  }

  throw error;
}
