import type { FastifyInstance } from "fastify";
import {
  approveBusinessProfileSchema,
  audienceOnboardingSchema,
  brandOnboardingSchema,
  companyOnboardingSchema,
  competitorsOnboardingSchema,
  objectivesOnboardingSchema,
  onboardingModuleSchema,
  productsOnboardingSchema,
  storyOnboardingSchema
} from "@markos/validation";
import { type z } from "zod";
import { AiServiceRequestError } from "../ai/request";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { UsagePlanInactiveError, UsageQuotaExceededError } from "../usage/usage-service";
import {
  approveWorkspaceBusinessProfile,
  BusinessProfileAlreadyApprovedError,
  BusinessProfileContextIncompleteError,
  BusinessProfileNotFoundError,
  generateWorkspaceBusinessProfile
} from "./business-profile-service";
import { completeOnboarding, getOnboardingState, OnboardingIncompleteError, saveOnboardingModule } from "./onboarding-service";

const moduleSchemas = {
  company: companyOnboardingSchema,
  story: storyOnboardingSchema,
  products: productsOnboardingSchema,
  audience: audienceOnboardingSchema,
  competitors: competitorsOnboardingSchema,
  brand: brandOnboardingSchema,
  objectives: objectivesOnboardingSchema
};

type ModuleSchema = (typeof moduleSchemas)[keyof typeof moduleSchemas];

export async function registerOnboardingRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/onboarding",
    {
      config: {
        workspaceRequired: true,
        permissions: ["onboarding:read"]
      }
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await getOnboardingState(workspaceId));
    }
  );

  app.put(
    "/v1/onboarding/:module",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["onboarding:write"]
      }
    },
    async (request, reply) => {
      const module = onboardingModuleSchema.safeParse((request.params as { module?: string }).module);

      if (!module.success) {
        return reply.status(404).send(errorEnvelope("ONBOARDING_MODULE_NOT_FOUND", "Unknown onboarding module"));
      }

      const schema: ModuleSchema = moduleSchemas[module.data];
      const parsed = schema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid onboarding module payload", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();
      return ok(await saveOnboardingModule(workspaceId, module.data, parsed.data as z.infer<ModuleSchema>));
    }
  );

  app.post(
    "/v1/onboarding/profile/generate",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["onboarding:write"]
      }
    },
    async (_request, reply) => {
      const { workspaceId } = requireWorkspaceContext();

      try {
        await generateWorkspaceBusinessProfile(workspaceId);
        return ok(await getOnboardingState(workspaceId));
      } catch (error) {
        if (error instanceof BusinessProfileContextIncompleteError) {
          return reply.status(409).send(errorEnvelope("ONBOARDING_INCOMPLETE", error.message));
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

  app.post(
    "/v1/onboarding/profile/approve",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["onboarding:write"]
      }
    },
    async (request, reply) => {
      const parsed = approveBusinessProfileSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid business profile", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        await approveWorkspaceBusinessProfile(workspaceId, parsed.data);
        return ok(await getOnboardingState(workspaceId));
      } catch (error) {
        if (error instanceof BusinessProfileNotFoundError) {
          return reply.status(404).send(errorEnvelope("BUSINESS_PROFILE_NOT_FOUND", error.message));
        }

        if (error instanceof BusinessProfileAlreadyApprovedError) {
          return reply.status(409).send(errorEnvelope("BUSINESS_PROFILE_ALREADY_APPROVED", error.message));
        }

        throw error;
      }
    }
  );

  app.post(
    "/v1/onboarding/complete",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["onboarding:write"]
      }
    },
    async (_request, reply) => {
      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await completeOnboarding(workspaceId));
      } catch (error) {
        if (error instanceof OnboardingIncompleteError) {
          return reply.status(409).send(errorEnvelope("ONBOARDING_INCOMPLETE", error.message, [error.state]));
        }

        throw error;
      }
    }
  );
}
