import type { FastifyInstance } from "fastify";
import { connectInstagramSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import {
  connectInstagram,
  ContentItemNotFoundForReadinessError,
  disconnectInstagram,
  getInstagramConnection,
  getPublishReadiness,
  WorkspaceNotFoundError
} from "./workspace-service";

export async function registerWorkspaceRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/workspace/instagram",
    {
      config: {
        workspaceRequired: true
      }
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await getInstagramConnection(workspaceId));
    }
  );

  app.put(
    "/v1/workspace/instagram",
    {
      config: {
        workspaceRequired: true
      }
    },
    async (request, reply) => {
      const parsed = connectInstagramSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid Instagram connection request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();
      return ok(await connectInstagram(workspaceId, parsed.data));
    }
  );

  app.delete(
    "/v1/workspace/instagram",
    {
      config: {
        workspaceRequired: true
      }
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await disconnectInstagram(workspaceId));
    }
  );

  app.get(
    "/v1/workspace/publish-readiness/:contentItemId",
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
        return ok(await getPublishReadiness(workspaceId, params.contentItemId));
      } catch (error) {
        if (error instanceof ContentItemNotFoundForReadinessError) {
          return reply.status(404).send(errorEnvelope("CONTENT_NOT_FOUND", error.message));
        }

        if (error instanceof WorkspaceNotFoundError) {
          return reply.status(404).send(errorEnvelope("WORKSPACE_NOT_FOUND", error.message));
        }

        throw error;
      }
    }
  );
}
