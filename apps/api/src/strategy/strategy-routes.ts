import type { FastifyInstance } from "fastify";
import { generateStrategySchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { generateWorkspaceStrategy, listStrategies, StrategyContextMissingError } from "./strategy-service";

export async function registerStrategyRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/strategy",
    {
      config: {
        workspaceRequired: true
      }
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await listStrategies(workspaceId));
    }
  );

  app.post(
    "/v1/strategy/generate",
    {
      config: {
        workspaceRequired: true
      }
    },
    async (request, reply) => {
      const parsed = generateStrategySchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid strategy generation request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await generateWorkspaceStrategy(workspaceId, parsed.data));
      } catch (error) {
        if (error instanceof StrategyContextMissingError) {
          return reply.status(409).send(errorEnvelope("STRATEGY_CONTEXT_MISSING", error.message));
        }

        throw error;
      }
    }
  );
}
