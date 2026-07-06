import type { FastifyInstance } from "fastify";
import { scheduleContentSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { toContentRecord } from "../content/content-service";
import {
  getPublishingLiveReadiness,
  listPublishingQueue,
  publishContentItem,
  PublishContentItemNotFoundError,
  publishDueContent,
  PublishRescheduleInvalidError,
  rescheduleFailedPublish
} from "./publishing-service";

export async function registerPublishingRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/publishing/live-readiness",
    {
      config: {
        workspaceRequired: true,
        permissions: ["publishing:run"]
      }
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await getPublishingLiveReadiness(workspaceId));
    }
  );

  app.get(
    "/v1/publishing/queue",
    {
      config: {
        workspaceRequired: true,
        permissions: ["publishing:run"]
      }
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      const rows = await listPublishingQueue(workspaceId);
      return ok(rows.map(toContentRecord));
    }
  );

  app.post(
    "/v1/publishing/run-due",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["publishing:run"]
      }
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await publishDueContent(workspaceId));
    }
  );

  app.post(
    "/v1/publishing/content/:contentItemId/dry-run",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["publishing:run"]
      }
    },
    async (request, reply) => {
      const params = request.params as { contentItemId?: string };

      if (!params.contentItemId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Content item id is required"));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await publishContentItem(workspaceId, params.contentItemId));
      } catch (error) {
        if (error instanceof PublishContentItemNotFoundError) {
          return reply.status(404).send(errorEnvelope("CONTENT_NOT_FOUND", error.message));
        }

        throw error;
      }
    }
  );

  app.post(
    "/v1/publishing/content/:contentItemId/reschedule",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["content:schedule", "publishing:run"]
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
        return ok(toContentRecord(await rescheduleFailedPublish(workspaceId, params.contentItemId, parsed.data)));
      } catch (error) {
        if (error instanceof PublishContentItemNotFoundError) {
          return reply.status(404).send(errorEnvelope("CONTENT_NOT_FOUND", error.message));
        }

        if (error instanceof PublishRescheduleInvalidError) {
          return reply.status(409).send(errorEnvelope("PUBLISH_RESCHEDULE_INVALID", error.message));
        }

        throw error;
      }
    }
  );
}
