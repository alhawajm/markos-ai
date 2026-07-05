import type { FastifyInstance } from "fastify";
import { createPromptTemplateSchema, promptAgentSchema, selectPromptVariantSchema, updatePromptTemplateSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import {
  createPromptTemplate,
  listPromptTemplates,
  PromptTemplateConflictError,
  PromptTemplateNotFoundError,
  selectPromptVariant,
  updatePromptTemplate
} from "./prompt-service";

export async function registerPromptRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/prompts",
    {
      config: {
        workspaceRequired: true,
        permissions: ["prompt:read"]
      }
    },
    async (request, reply) => {
      const query = request.query as { agent?: string };
      const agent = query.agent === undefined ? undefined : promptAgentSchema.safeParse(query.agent);

      if (agent !== undefined && !agent.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid prompt agent", agent.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();
      return ok(await listPromptTemplates(agent === undefined ? { workspaceId } : { agent: agent.data, workspaceId }));
    }
  );

  app.post(
    "/v1/prompts",
    {
      config: {
        workspaceRequired: true,
        permissions: ["prompt:manage"]
      }
    },
    async (request, reply) => {
      const parsed = createPromptTemplateSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid prompt template request", parsed.error.issues));
      }

      try {
        const { userId, workspaceId } = requireWorkspaceContext();
        return ok(await createPromptTemplate(workspaceId, parsed.data, { actorId: userId }));
      } catch (error) {
        if (error instanceof PromptTemplateConflictError) {
          return reply.status(409).send(errorEnvelope("PROMPT_TEMPLATE_CONFLICT", error.message));
        }

        throw error;
      }
    }
  );

  app.patch(
    "/v1/prompts/:promptTemplateId",
    {
      config: {
        workspaceRequired: true,
        permissions: ["prompt:manage"]
      }
    },
    async (request, reply) => {
      const params = request.params as { promptTemplateId?: string };
      const parsed = updatePromptTemplateSchema.safeParse(request.body ?? {});

      if (!params.promptTemplateId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Prompt template id is required"));
      }

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid prompt template update request", parsed.error.issues));
      }

      try {
        const { userId, workspaceId } = requireWorkspaceContext();
        return ok(await updatePromptTemplate(workspaceId, params.promptTemplateId, parsed.data, { actorId: userId }));
      } catch (error) {
        if (error instanceof PromptTemplateNotFoundError) {
          return reply.status(404).send(errorEnvelope("PROMPT_TEMPLATE_NOT_FOUND", error.message));
        }

        throw error;
      }
    }
  );

  app.post(
    "/v1/prompts/select",
    {
      config: {
        workspaceRequired: true,
        permissions: ["prompt:read"]
      }
    },
    async (request, reply) => {
      const parsed = selectPromptVariantSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid prompt selection request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();
      return ok(await selectPromptVariant(workspaceId, parsed.data));
    }
  );
}
