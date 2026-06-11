import type { FastifyInstance } from "fastify";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { publishContentItem, PublishContentItemNotFoundError, publishDueContent } from "./publishing-service";

export async function registerPublishingRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/v1/publishing/run-due",
    {
      config: {
        workspaceRequired: true
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
        workspaceRequired: true
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
}
