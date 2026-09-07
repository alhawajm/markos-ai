import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { errorEnvelope, ok } from "../http/envelope";
import { env } from "../config/env";
import { ContentConflictError } from "./content-conflict";
import { ConversationError, getContentConversation, submitConversationTurn, processConversationRuns } from "./conversation-service";

const paramsSchema = z.object({ contentItemId: z.string().uuid() });
const turnSchema = z
  .object({
    requestId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    message: z.string().trim().min(1).max(4000),
    locale: z.enum(["en", "ar"])
  })
  .strict();

export async function registerConversationRoutes(app: FastifyInstance) {
  app.get("/v1/content/:contentItemId/conversation", { config: { workspaceRequired: true, permissions: ["content:read"] } }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid post ID."));
    try {
      return ok(await getContentConversation(requireWorkspaceContext().workspaceId, params.data.contentItemId));
    } catch (error) {
      if (error instanceof ConversationError) return reply.status(error.statusCode).send(errorEnvelope(error.code, error.message));
      throw error;
    }
  });
  app.post(
    "/v1/content/:contentItemId/conversation",
    { config: { workspaceRequired: true, verifiedUserRequired: true, permissions: ["content:write"] } },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const input = turnSchema.safeParse(request.body);
      if (!params.success || !input.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid conversation message."));
      const { workspaceId, userId } = requireWorkspaceContext();
      try {
        return reply.status(202).send(ok(await submitConversationTurn(workspaceId, userId, params.data.contentItemId, input.data)));
      } catch (error) {
        if (error instanceof ConversationError || error instanceof ContentConflictError)
          return reply.status(error.statusCode).send(errorEnvelope(error.code, error.message));
        throw error;
      }
    }
  );
  if (env.NODE_ENV !== "test") {
    let running: Promise<void> | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    app.addHook("onReady", async () => {
      timer = setInterval(() => {
        if (running) return;
        running = processConversationRuns()
          .catch(() => app.log.error("Conversation processor failed"))
          .finally(() => {
            running = undefined;
          });
      }, 750);
      timer.unref();
    });
    app.addHook("onClose", async () => {
      clearInterval(timer);
      await running;
    });
  }
}
