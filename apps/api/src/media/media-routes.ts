import type { FastifyInstance } from "fastify";
import { attachMediaToContentSchema, generateImageForContentSchema, registerPublicMediaSchema, uploadMediaSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { UsagePlanInactiveError, UsageQuotaExceededError } from "../usage/usage-service";
import { MediaStorageError } from "./storage-service";
import {
  attachMediaToContent,
  deleteMediaAsset,
  detachMediaFromContent,
  generateImageForContent,
  listMediaAssets,
  MediaAssetInUseError,
  MediaAssetNotFoundError,
  MediaContentItemNotFoundError,
  MediaContentLockedError,
  MediaImageGenerationInvalidError,
  MediaUploadInvalidError,
  readPublicMediaFile,
  registerPublicMedia,
  uploadMedia
} from "./media-service";

const maxDirectUploadBodyBytes = 12 * 1024 * 1024;

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

  app.post(
    "/v1/media/upload",
    {
      bodyLimit: maxDirectUploadBodyBytes,
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

        if (error instanceof MediaStorageError) {
          return reply.status(503).send(errorEnvelope(error.code, "Media storage is temporarily unavailable"));
        }

        throw error;
      }
    }
  );

  app.delete(
    "/v1/media/:mediaAssetId",
    {
      config: {
        workspaceRequired: true,
        permissions: ["media:write"]
      }
    },
    async (request, reply) => {
      const params = request.params as { mediaAssetId?: string };

      if (!params.mediaAssetId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Media asset id is required"));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await deleteMediaAsset(workspaceId, params.mediaAssetId));
      } catch (error) {
        if (error instanceof MediaAssetNotFoundError) {
          return reply.status(404).send(errorEnvelope("MEDIA_NOT_FOUND", error.message));
        }

        if (error instanceof MediaAssetInUseError) {
          return reply.status(409).send(errorEnvelope("MEDIA_IN_USE", error.message));
        }

        if (error instanceof MediaStorageError) {
          return reply.status(503).send(errorEnvelope(error.code, "Media storage is temporarily unavailable"));
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
      return reply.header("Cross-Origin-Resource-Policy", "cross-origin").type(file.mimeType).send(file.bytes);
    } catch (error) {
      if (error instanceof MediaAssetNotFoundError) {
        return reply.status(404).send(errorEnvelope("MEDIA_NOT_FOUND", error.message));
      }

      if (error instanceof MediaStorageError) {
        return reply.status(503).send(errorEnvelope(error.code, "Media storage is temporarily unavailable"));
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

  if (error instanceof MediaContentLockedError) {
    return reply.status(409).send(errorEnvelope("CONTENT_LOCKED", error.message));
  }

  if (error instanceof UsageQuotaExceededError) {
    return reply.status(409).send(errorEnvelope("QUOTA_EXCEEDED", error.message, [{ metric: error.metric }]));
  }

  if (error instanceof UsagePlanInactiveError) {
    return reply.status(402).send(errorEnvelope("BILLING_STATUS_INACTIVE", error.message, [{ status: error.status }]));
  }

  if (error instanceof MediaStorageError) {
    return reply.status(503).send(errorEnvelope(error.code, "Media storage is temporarily unavailable"));
  }

  throw error;
}
