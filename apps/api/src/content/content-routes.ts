import type { FastifyInstance } from "fastify";
import { generateContentSchema, updateContentSchema, updateContentStatusSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import {
  ContentContextMissingError,
  ContentItemLockedError,
  ContentItemNotFoundError,
  ContentStatusTransitionError,
  generateWorkspaceContent,
  listContentItems,
  updateContentItem,
  updateContentItemStatus
} from "./content-service";

export async function registerContentRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/content",
    {
      config: {
        workspaceRequired: true
      }
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await listContentItems(workspaceId));
    }
  );

  app.post(
    "/v1/content/generate",
    {
      config: {
        workspaceRequired: true
      }
    },
    async (request, reply) => {
      const parsed = generateContentSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid content generation request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await generateWorkspaceContent(workspaceId, parsed.data));
      } catch (error) {
        if (error instanceof ContentContextMissingError) {
          return reply.status(409).send(errorEnvelope("CONTENT_CONTEXT_MISSING", error.message));
        }

        throw error;
      }
    }
  );

  app.patch(
    "/v1/content/:contentItemId",
    {
      config: {
        workspaceRequired: true
      }
    },
    async (request, reply) => {
      const params = request.params as { contentItemId?: string };
      const parsed = updateContentSchema.safeParse(request.body ?? {});

      if (!params.contentItemId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Content item id is required"));
      }

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid content update request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await updateContentItem(workspaceId, params.contentItemId, parsed.data));
      } catch (error) {
        if (error instanceof ContentItemNotFoundError) {
          return reply.status(404).send(errorEnvelope("CONTENT_NOT_FOUND", error.message));
        }

        if (error instanceof ContentItemLockedError) {
          return reply.status(409).send(errorEnvelope("CONTENT_LOCKED", error.message));
        }

        throw error;
      }
    }
  );

  app.post(
    "/v1/content/:contentItemId/status",
    {
      config: {
        workspaceRequired: true
      }
    },
    async (request, reply) => {
      const params = request.params as { contentItemId?: string };
      const parsed = updateContentStatusSchema.safeParse(request.body ?? {});

      if (!params.contentItemId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Content item id is required"));
      }

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid content status update request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await updateContentItemStatus(workspaceId, params.contentItemId, parsed.data));
      } catch (error) {
        if (error instanceof ContentItemNotFoundError) {
          return reply.status(404).send(errorEnvelope("CONTENT_NOT_FOUND", error.message));
        }

        if (error instanceof ContentStatusTransitionError) {
          return reply.status(409).send(errorEnvelope("CONTENT_STATUS_TRANSITION_INVALID", error.message));
        }

        throw error;
      }
    }
  );
}
