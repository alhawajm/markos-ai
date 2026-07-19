import type { FastifyInstance } from "fastify";
import {
  attachGeneratedMediaVariantSchema,
  attachMediaToContentSchema,
  generateImageForContentSchema,
  registerPublicMediaSchema,
  rejectGeneratedMediaVariantSchema,
  uploadMediaSchema,
  visualStudioGenerateSchema,
  visualStudioVariantListQuerySchema
} from "@markos/validation";
import { CatalogSelectionInvalidError, CatalogSelectionNotFoundError } from "../catalog/catalog-service";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { UsagePlanInactiveError, UsageQuotaExceededError } from "../usage/usage-service";
import {
  approveGeneratedMediaVariant,
  attachGeneratedMediaVariantToContent,
  attachMediaToContent,
  detachMediaFromContent,
  generateImageForContent,
  generateVisualStudioVariants,
  GeneratedMediaVariantNotApprovedError,
  GeneratedMediaVariantNotFoundError,
  listGeneratedMediaVariants,
  listMediaAssets,
  MediaAssetNotFoundError,
  MediaContentItemNotFoundError,
  MediaContentLockedError,
  MediaImageGenerationInvalidError,
  MediaUploadInvalidError,
  readPublicMediaFile,
  registerPublicMedia,
  rejectGeneratedMediaVariant,
  uploadMedia
} from "./media-service";

export async function registerMediaRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/media",
    {
      config: {
        workspaceRequired: true,
        permissions: ["media:read"]
      }
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await listMediaAssets(workspaceId));
    }
  );

  app.get(
    "/v1/media/visual-studio/variants",
    {
      config: {
        workspaceRequired: true,
        permissions: ["media:read"]
      }
    },
    async (request, reply) => {
      const parsed = visualStudioVariantListQuerySchema.safeParse(request.query ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid generated media query", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();
      return ok(await listGeneratedMediaVariants(workspaceId, parsed.data));
    }
  );

  app.post(
    "/v1/media/visual-studio/generate",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["media:write"]
      }
    },
    async (request, reply) => {
      const parsed = visualStudioGenerateSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid Visual Studio generation request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await generateVisualStudioVariants(workspaceId, parsed.data));
      } catch (error) {
        if (error instanceof MediaImageGenerationInvalidError) {
          return reply.status(502).send(errorEnvelope("AI_IMAGE_INVALID", error.message));
        }

        return handleMediaMutationError(error, reply);
      }
    }
  );

  app.post(
    "/v1/media/visual-studio/variants/:variantId/approve",
    {
      config: {
        workspaceRequired: true,
        permissions: ["media:write"]
      }
    },
    async (request, reply) => {
      const params = request.params as { variantId?: string };

      if (!params.variantId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Generated media variant id is required"));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await approveGeneratedMediaVariant(workspaceId, params.variantId));
      } catch (error) {
        return handleMediaMutationError(error, reply);
      }
    }
  );

  app.post(
    "/v1/media/visual-studio/variants/:variantId/reject",
    {
      config: {
        workspaceRequired: true,
        permissions: ["media:write"]
      }
    },
    async (request, reply) => {
      const params = request.params as { variantId?: string };
      const parsed = rejectGeneratedMediaVariantSchema.safeParse(request.body ?? {});

      if (!params.variantId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Generated media variant id is required"));
      }

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid generated media rejection request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await rejectGeneratedMediaVariant(workspaceId, params.variantId, parsed.data));
      } catch (error) {
        return handleMediaMutationError(error, reply);
      }
    }
  );

  app.post(
    "/v1/media/visual-studio/variants/:variantId/attach-to-content",
    {
      config: {
        workspaceRequired: true,
        permissions: ["media:write"]
      }
    },
    async (request, reply) => {
      const params = request.params as { variantId?: string };
      const parsed = attachGeneratedMediaVariantSchema.safeParse(request.body ?? {});

      if (!params.variantId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Generated media variant id is required"));
      }

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid generated media attachment request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await attachGeneratedMediaVariantToContent(workspaceId, params.variantId, parsed.data));
      } catch (error) {
        return handleMediaMutationError(error, reply);
      }
    }
  );

  app.post(
    "/v1/media/upload",
    {
      config: {
        workspaceRequired: true,
        permissions: ["media:write"]
      }
    },
    async (request, reply) => {
      const parsed = uploadMediaSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid media upload request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await uploadMedia(workspaceId, parsed.data));
      } catch (error) {
        if (error instanceof MediaUploadInvalidError) {
          return reply.status(400).send(errorEnvelope("MEDIA_UPLOAD_INVALID", error.message));
        }

        if (error instanceof UsageQuotaExceededError) {
          return reply.status(409).send(errorEnvelope("QUOTA_EXCEEDED", error.message, [{ metric: error.metric }]));
        }

        if (error instanceof UsagePlanInactiveError) {
          return reply.status(402).send(errorEnvelope("BILLING_STATUS_INACTIVE", error.message, [{ status: error.status }]));
        }

        throw error;
      }
    }
  );

  app.post(
    "/v1/media/public-url",
    {
      config: {
        workspaceRequired: true,
        permissions: ["media:write"]
      }
    },
    async (request, reply) => {
      const parsed = registerPublicMediaSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid media registration request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await registerPublicMedia(workspaceId, parsed.data));
      } catch (error) {
        if (error instanceof UsageQuotaExceededError) {
          return reply.status(409).send(errorEnvelope("QUOTA_EXCEEDED", error.message, [{ metric: error.metric }]));
        }

        if (error instanceof UsagePlanInactiveError) {
          return reply.status(402).send(errorEnvelope("BILLING_STATUS_INACTIVE", error.message, [{ status: error.status }]));
        }

        throw error;
      }
    }
  );

  app.post(
    "/v1/content/:contentItemId/generate-image",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["content:write", "media:write"]
      }
    },
    async (request, reply) => {
      const params = request.params as { contentItemId?: string };
      const parsed = generateImageForContentSchema.safeParse(request.body ?? {});

      if (!params.contentItemId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Content item id is required"));
      }

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid image generation request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await generateImageForContent(workspaceId, params.contentItemId, parsed.data));
      } catch (error) {
        if (error instanceof MediaImageGenerationInvalidError) {
          return reply.status(502).send(errorEnvelope("AI_IMAGE_INVALID", error.message));
        }

        return handleMediaMutationError(error, reply);
      }
    }
  );

  app.post(
    "/v1/content/:contentItemId/media",
    {
      config: {
        workspaceRequired: true,
        permissions: ["media:write"]
      }
    },
    async (request, reply) => {
      const params = request.params as { contentItemId?: string };
      const parsed = attachMediaToContentSchema.safeParse(request.body ?? {});

      if (!params.contentItemId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Content item id is required"));
      }

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid media attachment request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await attachMediaToContent(workspaceId, params.contentItemId, parsed.data.mediaAssetId));
      } catch (error) {
        return handleMediaMutationError(error, reply);
      }
    }
  );

  app.delete(
    "/v1/content/:contentItemId/media/:mediaAssetId",
    {
      config: {
        workspaceRequired: true,
        permissions: ["media:write"]
      }
    },
    async (request, reply) => {
      const params = request.params as { contentItemId?: string; mediaAssetId?: string };

      if (!params.contentItemId || !params.mediaAssetId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Content item id and media asset id are required"));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await detachMediaFromContent(workspaceId, params.contentItemId, params.mediaAssetId));
      } catch (error) {
        return handleMediaMutationError(error, reply);
      }
    }
  );

  app.get("/media-files/:workspaceId/:storedFilename", async (request, reply) => {
    const params = request.params as { workspaceId?: string; storedFilename?: string };

    if (!params.workspaceId || !params.storedFilename) {
      return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Workspace id and media filename are required"));
    }

    try {
      const file = await readPublicMediaFile(params.workspaceId, params.storedFilename);
      return reply.type(file.mimeType).send(file.bytes);
    } catch (error) {
      if (error instanceof MediaAssetNotFoundError) {
        return reply.status(404).send(errorEnvelope("MEDIA_NOT_FOUND", error.message));
      }

      throw error;
    }
  });
}

function handleMediaMutationError(error: unknown, reply: { status: (code: number) => { send: (payload: unknown) => unknown } }) {
  if (error instanceof MediaContentItemNotFoundError) {
    return reply.status(404).send(errorEnvelope("CONTENT_NOT_FOUND", error.message));
  }

  if (error instanceof MediaAssetNotFoundError) {
    return reply.status(404).send(errorEnvelope("MEDIA_NOT_FOUND", error.message));
  }

  if (error instanceof GeneratedMediaVariantNotFoundError) {
    return reply.status(404).send(errorEnvelope("GENERATED_MEDIA_NOT_FOUND", error.message));
  }

  if (error instanceof GeneratedMediaVariantNotApprovedError) {
    return reply.status(409).send(errorEnvelope("GENERATED_MEDIA_NOT_APPROVED", error.message));
  }

  if (error instanceof MediaContentLockedError) {
    return reply.status(409).send(errorEnvelope("CONTENT_LOCKED", error.message));
  }

  if (error instanceof CatalogSelectionNotFoundError) {
    return reply.status(404).send(errorEnvelope("CATALOG_SELECTION_NOT_FOUND", error.message));
  }

  if (error instanceof CatalogSelectionInvalidError) {
    return reply.status(409).send(errorEnvelope("CATALOG_SELECTION_INVALID", error.message));
  }

  if (error instanceof UsageQuotaExceededError) {
    return reply.status(409).send(errorEnvelope("QUOTA_EXCEEDED", error.message, [{ metric: error.metric }]));
  }

  if (error instanceof UsagePlanInactiveError) {
    return reply.status(402).send(errorEnvelope("BILLING_STATUS_INACTIVE", error.message, [{ status: error.status }]));
  }

  throw error;
}
