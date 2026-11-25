import { ContentAggregateError } from "../content/content-aggregate";
import { ContentConflictError } from "../content/content-conflict";
import type { FastifyInstance } from "fastify";
import {
  attachMediaToContentSchema,
  mediaRevisionSchema,
  generateImageForContentSchema,
  generateVideoForContentSchema,
  registerPublicMediaSchema,
  renderPostArtworkSchema,
  uploadMediaSchema,
  updateContentMediaSchema
} from "@markos/validation";
import { AiServiceRequestError } from "../ai/request";
import { requestAi, requestAiBinary } from "../ai/request";
import { prisma } from "../db/prisma";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { UsagePlanInactiveError, UsageQuotaExceededError } from "../usage/usage-service";
import { MediaStorageError, readStoredMedia } from "./storage-service";
import { ContentMediaValidationError } from "./content-media-integrity";
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
  toMediaAssetRecord,
  uploadMedia,
  updateContentMedia
} from "./media-service";
import {
  cancelMediaGenerationJob,
  getMediaGenerationJob,
  getLatestMediaGenerationJob,
  MediaGenerationJobNotFoundError,
  MediaGenerationJobStateError,
  MediaVideoGenerationUnsupportedError,
  queueVideoGeneration,
  retryMediaGenerationJob
} from "./video-generation-service";

const maxDirectUploadBodyBytes = 12 * 1024 * 1024;

export async function registerMediaRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/v1/media/post-artwork",
    {
      bodyLimit: maxDirectUploadBodyBytes,
      config: { workspaceRequired: true, verifiedUserRequired: true, permissions: ["media:write"] }
    },
    async (request, reply) => {
      const parsed = renderPostArtworkSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid post artwork request"));
      const { workspaceId } = requireWorkspaceContext();
      const { source, ...artwork } = parsed.data;
      try {
        let photoBase64 = source && "photoBase64" in source ? source.photoBase64 : undefined;
        if (source && "mediaAssetId" in source) {
          const asset = await prisma.mediaAsset.findFirst({
            where: { id: source.mediaAssetId, workspaceId, deletedAt: null, type: "IMAGE", sizeBytes: { lte: 8_000_000 } }
          });
          if (!asset || asset.s3Key.startsWith("external:")) throw new MediaAssetNotFoundError();
          photoBase64 = (await readStoredMedia(workspaceId, asset.s3Key)).toString("base64");
        }
        const jpeg = await requestAiBinary("/ai/posts/render-artwork", { ...artwork, photo_base64: photoBase64 }, 8_000_000);
        reply.header("Cache-Control", "private, no-store");
        return ok({ base64Data: jpeg.toString("base64") });
      } catch (error) {
        return handleMediaMutationError(error, reply);
      }
    }
  );

  app.get("/v1/media/video-capabilities", { config: { workspaceRequired: true, permissions: ["media:read"] } }, async () =>
    ok(await requestAi<{ motion: boolean; generatedFootage: boolean }>("/ai/videos/capabilities", { body: {} }))
  );
  app.patch("/v1/content/:contentItemId/media", { config: { workspaceRequired: true, permissions: ["media:write"] } }, async (request, reply) => {
    const { contentItemId } = request.params as { contentItemId: string };
    const parsed = updateContentMediaSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid media list", parsed.error.issues));
    const { workspaceId } = requireWorkspaceContext();
    try {
      return ok(await updateContentMedia(workspaceId, contentItemId, parsed.data));
    } catch (error) {
      return handleMediaMutationError(error, reply);
    }
  });
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
  app.get("/v1/media/:id", { config: { workspaceRequired: true, permissions: ["media:read"] } }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid asset ID"));
    const { workspaceId } = requireWorkspaceContext();
    const asset = await prisma.mediaAsset.findFirst({ where: { id, workspaceId, deletedAt: null } });
    if (!asset) return reply.status(404).send(errorEnvelope("MEDIA_NOT_FOUND", "Media asset was not found"));
    reply.header("Cache-Control", "private, no-store");
    return ok(toMediaAssetRecord(asset));
  });

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
    "/v1/content/:contentItemId/generate-video",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["content:write", "media:write"]
      }
    },
    async (request, reply) => {
      const params = request.params as { contentItemId?: string };
      const parsed = generateVideoForContentSchema.safeParse(request.body ?? {});
      if (!params.contentItemId) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Content item id is required"));
      if (!parsed.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid video generation request", parsed.error.issues));
      const { workspaceId } = requireWorkspaceContext();
      try {
        return reply.status(202).send(ok(await queueVideoGeneration(workspaceId, params.contentItemId, parsed.data)));
      } catch (error) {
        if (error instanceof MediaVideoGenerationUnsupportedError) {
          return reply.status(409).send(errorEnvelope("AI_VIDEO_CONTENT_TYPE_UNSUPPORTED", error.message));
        }
        return handleMediaMutationError(error, reply);
      }
    }
  );

  app.get("/v1/media-generation/:jobId", { config: { workspaceRequired: true, permissions: ["media:read"] } }, async (request, reply) => {
    const params = request.params as { jobId?: string };
    if (!params.jobId) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Media generation job id is required"));
    const { workspaceId } = requireWorkspaceContext();
    try {
      return ok(await getMediaGenerationJob(workspaceId, params.jobId));
    } catch (error) {
      if (error instanceof MediaGenerationJobNotFoundError) return reply.status(404).send(errorEnvelope("MEDIA_GENERATION_NOT_FOUND", error.message));
      throw error;
    }
  });

  app.get(
    "/v1/content/:contentItemId/media-generation/latest",
    { config: { workspaceRequired: true, permissions: ["media:read"] } },
    async (request, reply) => {
      const params = request.params as { contentItemId?: string };
      if (!params.contentItemId) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Content item id is required"));
      const { workspaceId } = requireWorkspaceContext();
      return ok(await getLatestMediaGenerationJob(workspaceId, params.contentItemId));
    }
  );

  for (const action of ["cancel", "retry"] as const) {
    app.post(
      `/v1/media-generation/:jobId/${action}`,
      { config: { workspaceRequired: true, verifiedUserRequired: true, permissions: ["media:write"] } },
      async (request, reply) => {
        const params = request.params as { jobId?: string };
        if (!params.jobId) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Media generation job id is required"));
        const { workspaceId } = requireWorkspaceContext();
        const parsed = mediaRevisionSchema.safeParse(request.body);
        if (action === "retry" && !parsed.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Expected revision is required"));
        try {
          return ok(
            action === "cancel"
              ? await cancelMediaGenerationJob(workspaceId, params.jobId)
              : await retryMediaGenerationJob(workspaceId, params.jobId, parsed.success ? parsed.data.expectedRevision : 0)
          );
        } catch (error) {
          if (error instanceof MediaGenerationJobNotFoundError) return reply.status(404).send(errorEnvelope("MEDIA_GENERATION_NOT_FOUND", error.message));
          if (error instanceof MediaGenerationJobStateError) return reply.status(409).send(errorEnvelope("MEDIA_GENERATION_STATE_INVALID", error.message));
          return handleMediaMutationError(error, reply);
        }
      }
    );
  }

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
        return ok(await attachMediaToContent(workspaceId, params.contentItemId, parsed.data));
      } catch (error) {
        return handleMediaMutationError(error, reply);
      }
    }
  );

  app.delete(
    "/v1/content/:contentItemId/media/:contentMediaItemId",
    {
      config: {
        workspaceRequired: true,
        permissions: ["media:write"]
      }
    },
    async (request, reply) => {
      const params = request.params as { contentItemId?: string; contentMediaItemId?: string };

      if (!params.contentItemId || !params.contentMediaItemId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Content item id and media asset id are required"));
      }

      const parsed = mediaRevisionSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Expected revision is required"));
      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await detachMediaFromContent(workspaceId, params.contentItemId, params.contentMediaItemId, parsed.data.expectedRevision));
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
  if (error instanceof ContentAggregateError) return reply.status(error.statusCode).send(errorEnvelope(error.code, error.message));
  if (error instanceof ContentConflictError) return reply.status(409).send(errorEnvelope(error.code, error.message));
  if (error instanceof ContentMediaValidationError) {
    return reply
      .status(409)
      .send(errorEnvelope(error.code, error.message, error.mediaAssetId ? [{ mediaAssetId: error.mediaAssetId, savedToLibrary: true }] : []));
  }
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

  if (error instanceof AiServiceRequestError) {
    return reply.status(error.statusCode).send(errorEnvelope(error.code, error.message, [{ retryable: error.retryable }]));
  }

  if (error instanceof MediaStorageError) {
    return reply.status(503).send(errorEnvelope(error.code, "Media storage is temporarily unavailable"));
  }

  throw error;
}
