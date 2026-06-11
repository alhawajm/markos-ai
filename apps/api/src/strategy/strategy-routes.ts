import type { FastifyInstance } from "fastify";
import { generateStrategySchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { UsagePlanInactiveError, UsageQuotaExceededError } from "../usage/usage-service";
import { generateWorkspaceStrategy, listStrategies, StrategyContextMissingError } from "./strategy-service";

export async function registerStrategyRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/strategy",
    {
      config: {
        workspaceRequired: true,
        permissions: ["strategy:read"]
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
        workspaceRequired: true,
        permissions: ["strategy:generate"]
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
}
