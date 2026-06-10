import type { FastifyInstance } from "fastify";
import { generateContentSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { ContentContextMissingError, generateWorkspaceContent, listContentItems } from "./content-service";

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
}
