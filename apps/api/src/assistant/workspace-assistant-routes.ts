import type { FastifyInstance, FastifyContextConfig } from "fastify";
import { z } from "zod";
import { workspaceAssistantMessageSchema, workspaceAssistantConfirmSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { ConversationError } from "../content/conversation-service";
import { confirmWorkspacePlan, processWorkspaceAssistant, submitWorkspaceMessage, workspaceAssistantHistory } from "./workspace-assistant-service";
import { env } from "../config/env";
import { taskIntents } from "@markos/shared-types";
import { forgetPersonalMemory, listPersonalMemory } from "../vault/personalization-service";

export async function registerWorkspaceAssistantRoutes(app: FastifyInstance) {
  const config: FastifyContextConfig = {
    workspaceRequired: true,
    verifiedUserRequired: true,
    permissions: ["content:write", "agent:run", "campaign:generate"]
  };
  app.get("/v1/assistant/memory", { config: { ...config, permissions: ["workspace:read"] } }, async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const { workspaceId, userId } = requireWorkspaceContext();
    return ok(await listPersonalMemory(workspaceId, userId));
  });
  app.delete("/v1/assistant/memory/:id", { config: { ...config, permissions: ["workspace:read"] } }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid memory"));
    const { workspaceId, userId } = requireWorkspaceContext();
    if (!(await forgetPersonalMemory(workspaceId, userId, params.data.id)))
      return reply.status(404).send(errorEnvelope("MEMORY_NOT_FOUND", "Preference not found"));
    return ok({ forgotten: true });
  });
  app.get("/v1/assistant/conversation", { config: { ...config, permissions: ["workspace:read"] } }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const { workspaceId, userId } = requireWorkspaceContext();
    const query = z.object({ intent: z.enum(taskIntents).optional() }).safeParse(request.query);
    if (!query.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid conversation area"));
    return ok(await workspaceAssistantHistory(workspaceId, userId, query.data.intent));
  });
  app.post("/v1/assistant/conversation", { config }, async (request, reply) => {
    const input = workspaceAssistantMessageSchema.safeParse(request.body);
    if (!input.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid message", input.error.issues));
    const { workspaceId, userId } = requireWorkspaceContext();
    try {
      return reply.status(202).send(ok(await submitWorkspaceMessage(workspaceId, userId, input.data)));
    } catch (error) {
      if (error instanceof ConversationError) return reply.status(error.statusCode).send(errorEnvelope(error.code, error.message));
      throw error;
    }
  });
  app.post("/v1/assistant/conversation/:id/confirm", { config }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params),
      input = workspaceAssistantConfirmSchema.safeParse(request.body);
    if (!params.success || !input.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid confirmation"));
    const { workspaceId, userId } = requireWorkspaceContext();
    try {
      return ok(await confirmWorkspacePlan(workspaceId, userId, params.data.id, input.data.confirmationToken));
    } catch (error) {
      if (error instanceof ConversationError) return reply.status(error.statusCode).send(errorEnvelope(error.code, error.message));
      throw error;
    }
  });
  if (env.NODE_ENV !== "test" && env.CONVERSATION_PROCESSOR_ENABLED) {
    let running: Promise<void> | undefined;
    const timer = setInterval(() => {
      if (!running)
        running = processWorkspaceAssistant()
          .catch((error) => app.log.error(error, "Workspace conversation failed"))
          .finally(() => {
            running = undefined;
          });
    }, 1000);
    timer.unref();
    app.addHook("onClose", async () => {
      clearInterval(timer);
      await running;
    });
  }
}
