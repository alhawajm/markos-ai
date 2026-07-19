import type { FastifyInstance } from "fastify";
import { generateStrategySchema } from "@markos/validation";
import { CatalogGenerationGuardrailError, CatalogSelectionInvalidError, CatalogSelectionNotFoundError } from "../catalog/catalog-service";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { UsagePlanInactiveError, UsageQuotaExceededError } from "../usage/usage-service";
import {
  exportStrategyPdf,
  generateWorkspaceStrategy,
  listStrategies,
  StrategyContextMissingError,
  StrategyNotFoundError
} from "./strategy-service";

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
        verifiedUserRequired: true,
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

        if (error instanceof CatalogSelectionNotFoundError) {
          return reply.status(404).send(errorEnvelope("CATALOG_SELECTION_NOT_FOUND", error.message));
        }

        if (error instanceof CatalogSelectionInvalidError) {
          return reply.status(409).send(errorEnvelope("CATALOG_SELECTION_INVALID", error.message));
        }

        if (error instanceof CatalogGenerationGuardrailError) {
          return reply.status(409).send(errorEnvelope("CATALOG_GENERATION_GUARDRAIL", error.message, error.details));
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

  app.get(
    "/v1/strategy/:strategyId/pdf",
    {
      config: {
        workspaceRequired: true,
        permissions: ["strategy:read"]
      }
    },
    async (request, reply) => {
      const params = request.params as { strategyId?: string };

      if (!params.strategyId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Strategy id is required"));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        const pdf = await exportStrategyPdf(workspaceId, params.strategyId);

        return reply
          .header("content-type", "application/pdf")
          .header("content-disposition", `attachment; filename="${pdf.filename}"`)
          .send(pdf.bytes);
      } catch (error) {
        if (error instanceof StrategyNotFoundError) {
          return reply.status(404).send(errorEnvelope("STRATEGY_NOT_FOUND", error.message));
        }

        throw error;
      }
    }
  );
}
