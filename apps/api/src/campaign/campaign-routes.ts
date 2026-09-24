import type { FastifyInstance } from "fastify";
import { approveCampaignSuggestionSchema, generateCampaignSchema } from "@markos/validation";
import { CampaignReferenceFileError, maxCampaignReferenceBodyBytes } from "./campaign-reference-files";
import { AiServiceRequestError } from "../ai/request";
import { env } from "../config/env";
import { CampaignGenerationError } from "./campaign-generation-access";
import { listCampaignGenerations, processCampaignGenerations, queueCampaignGeneration, readCampaignGeneration } from "./campaign-generation-service";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { UsagePlanInactiveError, UsageQuotaExceededError } from "../usage/usage-service";
import {
  approveCampaignSuggestion,
  CampaignContextMissingError,
  CampaignListInputError,
  CampaignNotFoundError,
  CampaignSuggestionNotFoundError,
  exportCampaignPdf,
  generateWorkspaceCampaign,
  listCampaignDrafts,
  listCampaigns,
  listCampaignSummaries,
  readCampaignReview
} from "./campaign-service";

export async function registerCampaignRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/campaigns/generations", { config: { workspaceRequired: true, permissions: ["campaign:read"] } }, async () => {
    return ok(await listCampaignGenerations(requireWorkspaceContext().workspaceId));
  });
  app.get("/v1/campaigns/generations/:requestId", { config: { workspaceRequired: true, permissions: ["campaign:read"] } }, async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(requestId))
      return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid generation request ID"));
    try {
      return ok(await readCampaignGeneration(requireWorkspaceContext().workspaceId, requestId));
    } catch (error) {
      if (error instanceof CampaignGenerationError) return reply.status(error.statusCode).send(errorEnvelope(error.code, error.message));
      throw error;
    }
  });
  app.post(
    "/v1/campaigns/generations",
    {
      bodyLimit: maxCampaignReferenceBodyBytes,
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["campaign:generate"]
      }
    },
    async (request, reply) => {
      const requestId = request.headers["idempotency-key"];
      const parsed = generateCampaignSchema.safeParse(request.body ?? {});
      if (typeof requestId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(requestId) || !parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "A valid campaign brief and Idempotency-Key are required"));
      }
      const { workspaceId, userId } = requireWorkspaceContext();
      try {
        return reply.status(202).send(ok(await queueCampaignGeneration(workspaceId, userId, requestId, parsed.data)));
      } catch (error) {
        if (error instanceof CampaignGenerationError) return reply.status(error.statusCode).send(errorEnvelope(error.code, error.message));
        if (error instanceof CampaignReferenceFileError) return reply.status(400).send(errorEnvelope("CAMPAIGN_REFERENCE_INVALID", error.message));
        if (error instanceof CampaignContextMissingError) return reply.status(409).send(errorEnvelope("CAMPAIGN_CONTEXT_MISSING", error.message));
        throw error;
      }
    }
  );
  if (env.NODE_ENV !== "test") {
    // An independent processor keeps long campaign AI calls off HTTP requests and
    // out of the publishing tick. SQL claims coordinate overlapping deployments.
    let running: Promise<void> | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    app.addHook("onReady", async () => {
      timer = setInterval(() => {
        if (running) return;
        running = processCampaignGenerations()
          .catch(() => app.log.error("Campaign processor failed"))
          .finally(() => {
            running = undefined;
          });
      }, 1500);
      timer.unref();
    });
    app.addHook("onClose", async () => {
      clearInterval(timer);
      await running;
    });
  }
  app.get("/v1/campaigns/summaries", { config: { workspaceRequired: true, permissions: ["campaign:read", "content:read"] } }, async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    if (Object.entries(query).some(([key, value]) => !["limit", "cursor", "query"].includes(key) || typeof value !== "string")) {
      return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid campaign page or search request"));
    }
    const { workspaceId } = requireWorkspaceContext();
    try {
      return ok(await listCampaignSummaries(workspaceId, query as { limit?: string; cursor?: string; query?: string }));
    } catch (error) {
      if (error instanceof CampaignListInputError) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", error.message));
      throw error;
    }
  });

  app.get(
    "/v1/campaigns/:campaignId/review",
    { config: { workspaceRequired: true, permissions: ["campaign:read", "content:read", "media:read"] } },
    async (request, reply) => {
      const { campaignId } = request.params as { campaignId: string };
      if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(campaignId)) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid campaign id"));
      }
      const { workspaceId } = requireWorkspaceContext();
      try {
        return ok(await readCampaignReview(workspaceId, campaignId));
      } catch (error) {
        if (error instanceof CampaignNotFoundError) return reply.status(404).send(errorEnvelope("CAMPAIGN_NOT_FOUND", error.message));
        throw error;
      }
    }
  );

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
      bodyLimit: maxCampaignReferenceBodyBytes,
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
        if (error instanceof CampaignReferenceFileError) {
          return reply.status(400).send(errorEnvelope("CAMPAIGN_REFERENCE_INVALID", error.message));
        }
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
    "/v1/campaigns/:campaignId/drafts",
    {
      config: {
        workspaceRequired: true,
        permissions: ["campaign:read", "content:read"]
      }
    },
    async (request, reply) => {
      const params = request.params as { campaignId?: string };

      if (!params.campaignId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Campaign id is required"));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await listCampaignDrafts(workspaceId, params.campaignId));
      } catch (error) {
        if (error instanceof CampaignNotFoundError) {
          return reply.status(404).send(errorEnvelope("CAMPAIGN_NOT_FOUND", error.message));
        }

        throw error;
      }
    }
  );

  app.post(
    "/v1/campaigns/:campaignId/suggestions/approve",
    {
      config: {
        workspaceRequired: true,
        permissions: ["campaign:read", "content:write"]
      }
    },
    async (request, reply) => {
      const params = request.params as { campaignId?: string };
      const parsed = approveCampaignSuggestionSchema.safeParse(request.body ?? {});

      if (!params.campaignId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Campaign id is required"));
      }

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid Campaign suggestion approval", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await approveCampaignSuggestion(workspaceId, params.campaignId, parsed.data));
      } catch (error) {
        if (error instanceof CampaignNotFoundError) {
          return reply.status(404).send(errorEnvelope("CAMPAIGN_NOT_FOUND", error.message));
        }

        if (error instanceof CampaignSuggestionNotFoundError) {
          return reply.status(404).send(errorEnvelope("CAMPAIGN_SUGGESTION_NOT_FOUND", error.message));
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
