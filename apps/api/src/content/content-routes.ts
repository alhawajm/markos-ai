import type { FastifyInstance } from "fastify";
import {
  createContentSchema,
  generateContentForSlotSchema,
  generateContentSchema,
  scheduleContentSchema,
  updateContentSchema,
  updateContentStatusSchema
} from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { UsagePlanInactiveError, UsageQuotaExceededError } from "../usage/usage-service";
import {
  ContentContextMissingError,
  ContentItemDeleteError,
  ContentItemLockedError,
  ContentItemNotFoundError,
  ContentScheduleError,
  ContentStatusTransitionError,
  createWorkspaceContent,
  deleteContentItem,
  generateWorkspaceContentForSlot,
  generateWorkspaceContent,
  listContentItems,
  rescheduleContentItem,
  scheduleContentItem,
  unscheduleContentItem,
  updateContentItem,
  updateContentItemStatus
} from "./content-service";

export async function registerContentRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/content",
    {
      config: {
        workspaceRequired: true,
        permissions: ["content:read"]
      }
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await listContentItems(workspaceId));
    }
  );

  app.post(
    "/v1/content",
    {
      config: {
        workspaceRequired: true,
        permissions: ["content:write"]
      }
    },
    async (request, reply) => {
      const parsed = createContentSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid blank content request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();
      return ok(await createWorkspaceContent(workspaceId, parsed.data));
    }
  );

  app.post(
    "/v1/content/generate",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["content:write"]
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

        if (error instanceof UsageQuotaExceededError) {
          return reply.status(402).send(errorEnvelope("USAGE_QUOTA_EXCEEDED", error.message, [{ metric: error.metric }]));
        }

        if (error instanceof UsagePlanInactiveError) {
          return reply.status(402).send(errorEnvelope("BILLING_STATUS_INACTIVE", error.message, [{ status: error.status }]));
        }

        throw error;
      }
    }
  );

  app.post(
    "/v1/content/generate-for-slot",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["content:write", "content:schedule"]
      }
    },
    async (request, reply) => {
      const parsed = generateContentForSlotSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid slot content generation request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await generateWorkspaceContentForSlot(workspaceId, parsed.data));
      } catch (error) {
        if (error instanceof ContentContextMissingError) {
          return reply.status(409).send(errorEnvelope("CONTENT_CONTEXT_MISSING", error.message));
        }

        if (error instanceof ContentScheduleError) {
          return reply.status(409).send(errorEnvelope("CONTENT_SCHEDULE_INVALID", error.message));
        }

        if (error instanceof UsageQuotaExceededError) {
          return reply.status(402).send(errorEnvelope("USAGE_QUOTA_EXCEEDED", error.message, [{ metric: error.metric }]));
        }

        if (error instanceof UsagePlanInactiveError) {
          return reply.status(402).send(errorEnvelope("BILLING_STATUS_INACTIVE", error.message, [{ status: error.status }]));
        }

        throw error;
      }
    }
  );

  app.patch(
    "/v1/content/:contentItemId",
    {
      config: {
        workspaceRequired: true,
        permissions: ["content:write"]
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

  app.delete(
    "/v1/content/:contentItemId",
    {
      config: {
        workspaceRequired: true,
        permissions: ["content:write"]
      }
    },
    async (request, reply) => {
      const params = request.params as { contentItemId?: string };

      if (!params.contentItemId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Content item id is required"));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await deleteContentItem(workspaceId, params.contentItemId));
      } catch (error) {
        if (error instanceof ContentItemNotFoundError) {
          return reply.status(404).send(errorEnvelope("CONTENT_NOT_FOUND", error.message));
        }

        if (error instanceof ContentItemDeleteError) {
          return reply.status(409).send(errorEnvelope(error.code, error.message));
        }

        throw error;
      }
    }
  );

  app.post(
    "/v1/content/:contentItemId/status",
    {
      config: {
        workspaceRequired: true,
        permissions: ["content:write"]
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

  app.post(
    "/v1/content/:contentItemId/schedule",
    {
      config: {
        workspaceRequired: true,
        permissions: ["content:schedule"]
      }
    },
    async (request, reply) => {
      const params = request.params as { contentItemId?: string };
      const parsed = scheduleContentSchema.safeParse(request.body ?? {});

      if (!params.contentItemId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Content item id is required"));
      }

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid schedule request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await scheduleContentItem(workspaceId, params.contentItemId, parsed.data));
      } catch (error) {
        if (error instanceof ContentItemNotFoundError) {
          return reply.status(404).send(errorEnvelope("CONTENT_NOT_FOUND", error.message));
        }

        if (error instanceof ContentScheduleError) {
          return reply.status(409).send(errorEnvelope("CONTENT_SCHEDULE_INVALID", error.message));
        }

        throw error;
      }
    }
  );

  app.post(
    "/v1/content/:contentItemId/reschedule",
    {
      config: {
        workspaceRequired: true,
        permissions: ["content:schedule"]
      }
    },
    async (request, reply) => {
      const params = request.params as { contentItemId?: string };
      const parsed = scheduleContentSchema.safeParse(request.body ?? {});

      if (!params.contentItemId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Content item id is required"));
      }

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid reschedule request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await rescheduleContentItem(workspaceId, params.contentItemId, parsed.data));
      } catch (error) {
        if (error instanceof ContentItemNotFoundError) {
          return reply.status(404).send(errorEnvelope("CONTENT_NOT_FOUND", error.message));
        }

        if (error instanceof ContentScheduleError) {
          return reply.status(409).send(errorEnvelope("CONTENT_SCHEDULE_INVALID", error.message));
        }

        throw error;
      }
    }
  );

  app.post(
    "/v1/content/:contentItemId/unschedule",
    {
      config: {
        workspaceRequired: true,
        permissions: ["content:schedule"]
      }
    },
    async (request, reply) => {
      const params = request.params as { contentItemId?: string };

      if (!params.contentItemId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Content item id is required"));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await unscheduleContentItem(workspaceId, params.contentItemId));
      } catch (error) {
        if (error instanceof ContentItemNotFoundError) {
          return reply.status(404).send(errorEnvelope("CONTENT_NOT_FOUND", error.message));
        }

        if (error instanceof ContentScheduleError) {
          return reply.status(409).send(errorEnvelope("CONTENT_SCHEDULE_INVALID", error.message));
        }

        throw error;
      }
    }
  );
}
