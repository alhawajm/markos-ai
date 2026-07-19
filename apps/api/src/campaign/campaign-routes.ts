import type { FastifyInstance } from "fastify";
import {
  campaignItemParamsSchema,
  campaignPackageListQuerySchema,
  campaignParamsSchema,
  generateCampaignPackageSchema,
  rejectCampaignItemSchema,
  scheduleCampaignPackageSchema
} from "@markos/validation";
import { CatalogGenerationGuardrailError, CatalogSelectionInvalidError, CatalogSelectionNotFoundError } from "../catalog/catalog-service";
import { ContentContextMissingError } from "../content/content-service";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { UsagePlanInactiveError, UsageQuotaExceededError } from "../usage/usage-service";
import {
  approveCampaignPackage,
  CampaignContextMissingError,
  CampaignItemNotFoundError,
  CampaignNotFoundError,
  CampaignStateError,
  generateCampaignPackage,
  listCampaignPackages,
  rejectCampaignItem,
  scheduleCampaignPackage
} from "./campaign-service";

export async function registerCampaignRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/campaigns/packages",
    {
      config: {
        workspaceRequired: true,
        permissions: ["content:read"]
      }
    },
    async (request, reply) => {
      const parsed = campaignPackageListQuerySchema.safeParse(request.query ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid campaign package query", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();
      return ok(await listCampaignPackages(workspaceId, parsed.data));
    }
  );

  app.post(
    "/v1/campaigns/packages/generate",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["content:write"]
      }
    },
    async (request, reply) => {
      const parsed = generateCampaignPackageSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid campaign package request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await generateCampaignPackage(workspaceId, parsed.data));
      } catch (error) {
        return handleCampaignError(reply, error);
      }
    }
  );

  app.post(
    "/v1/campaigns/:campaignId/approve",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["content:write"]
      }
    },
    async (request, reply) => {
      const parsed = campaignParamsSchema.safeParse(request.params ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid campaign id", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await approveCampaignPackage(workspaceId, parsed.data.campaignId));
      } catch (error) {
        return handleCampaignError(reply, error);
      }
    }
  );

  app.post(
    "/v1/campaigns/:campaignId/items/:contentItemId/reject",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["content:write"]
      }
    },
    async (request, reply) => {
      const params = campaignItemParamsSchema.safeParse(request.params ?? {});
      const body = rejectCampaignItemSchema.safeParse(request.body ?? {});

      if (!params.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid campaign item id", params.error.issues));
      }

      if (!body.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid campaign item rejection", body.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await rejectCampaignItem(workspaceId, params.data.campaignId, params.data.contentItemId, body.data));
      } catch (error) {
        return handleCampaignError(reply, error);
      }
    }
  );

  app.post(
    "/v1/campaigns/:campaignId/schedule",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["content:schedule"]
      }
    },
    async (request, reply) => {
      const params = campaignParamsSchema.safeParse(request.params ?? {});
      const body = scheduleCampaignPackageSchema.safeParse(request.body ?? {});

      if (!params.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid campaign id", params.error.issues));
      }

      if (!body.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid campaign schedule request", body.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await scheduleCampaignPackage(workspaceId, params.data.campaignId, body.data));
      } catch (error) {
        return handleCampaignError(reply, error);
      }
    }
  );
}

function handleCampaignError(reply: { status: (code: number) => { send: (payload: unknown) => unknown } }, error: unknown): unknown {
  if (error instanceof CampaignContextMissingError || error instanceof ContentContextMissingError) {
    return reply.status(409).send(errorEnvelope("CAMPAIGN_CONTEXT_MISSING", error.message));
  }

  if (error instanceof CampaignNotFoundError || error instanceof CampaignItemNotFoundError) {
    return reply.status(404).send(errorEnvelope("CAMPAIGN_NOT_FOUND", error.message));
  }

  if (error instanceof CampaignStateError) {
    return reply.status(409).send(errorEnvelope("CAMPAIGN_STATE_INVALID", error.message));
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
