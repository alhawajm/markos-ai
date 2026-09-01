import type { FastifyInstance } from "fastify";
import { generateCampaignSchema } from "@markos/validation";
import { AiServiceRequestError } from "../ai/request";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { UsagePlanInactiveError, UsageQuotaExceededError } from "../usage/usage-service";
import { CampaignContextMissingError, CampaignNotFoundError, exportCampaignPdf, generateWorkspaceCampaign, listCampaigns } from "./campaign-service";

export async function registerCampaignRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/campaigns",
    {
      config: {
        workspaceRequired: true,
        permissions: ["campaign:read"]
      }
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await listCampaigns(workspaceId));
    }
  );

  app.post(
    "/v1/campaigns/generate",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["campaign:generate"]
      }
    },
    async (request, reply) => {
      const parsed = generateCampaignSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid campaign generation request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await generateWorkspaceCampaign(workspaceId, parsed.data));
      } catch (error) {
        if (error instanceof CampaignContextMissingError) {
          return reply.status(409).send(errorEnvelope("CAMPAIGN_CONTEXT_MISSING", error.message));
        }

        if (error instanceof UsageQuotaExceededError) {
          return reply.status(402).send(errorEnvelope("USAGE_QUOTA_EXCEEDED", error.message, [{ metric: error.metric }]));
        }

        if (error instanceof UsagePlanInactiveError) {
          return reply.status(402).send(errorEnvelope("BILLING_STATUS_INACTIVE", error.message, [{ status: error.status }]));
        }

        if (error instanceof AiServiceRequestError) {
          return reply.status(error.statusCode).send(errorEnvelope(error.code, error.message, [{ retryable: error.retryable }]));
        }

        throw error;
      }
    }
  );

  app.get(
    "/v1/campaigns/:campaignId/pdf",
    {
      config: {
        workspaceRequired: true,
        permissions: ["campaign:read"]
      }
    },
    async (request, reply) => {
      const params = request.params as { campaignId?: string };

      if (!params.campaignId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Campaign id is required"));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        const pdf = await exportCampaignPdf(workspaceId, params.campaignId);

        return reply.header("content-type", "application/pdf").header("content-disposition", `attachment; filename="${pdf.filename}"`).send(pdf.bytes);
      } catch (error) {
        if (error instanceof CampaignNotFoundError) {
          return reply.status(404).send(errorEnvelope("CAMPAIGN_NOT_FOUND", error.message));
        }

        throw error;
      }
    }
  );
}
