import type { FastifyInstance } from "fastify";
import { runAgentSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { UsagePlanInactiveError, UsageQuotaExceededError } from "../usage/usage-service";
import { AgentContextMissingError, runWorkspaceAgent } from "./agent-service";

export async function registerAgentRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/v1/agents/run",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["agent:run"]
      }
    },
    async (request, reply) => {
      const parsed = runAgentSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid agent run request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await runWorkspaceAgent(workspaceId, parsed.data));
      } catch (error) {
        if (error instanceof AgentContextMissingError) {
          return reply.status(409).send(errorEnvelope("AGENT_CONTEXT_MISSING", error.message));
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
