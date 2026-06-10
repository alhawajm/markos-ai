import type { FastifyInstance } from "fastify";
import { attachMediaToContentSchema, registerPublicMediaSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import {
  attachMediaToContent,
  detachMediaFromContent,
  listMediaAssets,
  MediaAssetNotFoundError,
  MediaContentItemNotFoundError,
  MediaContentLockedError,
  registerPublicMedia
} from "./media-service";

export async function registerMediaRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/media",
    {
      config: {
        workspaceRequired: true
      }
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await listMediaAssets(workspaceId));
    }
  );

  app.post(
    "/v1/media/public-url",
    {
      config: {
        workspaceRequired: true
      }
    },
    async (request, reply) => {
      const parsed = registerPublicMediaSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid media registration request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();
      return ok(await registerPublicMedia(workspaceId, parsed.data));
    }
  );

  app.post(
    "/v1/content/:contentItemId/media",
    {
      config: {
        workspaceRequired: true
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
        workspaceRequired: true
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

  throw error;
}
