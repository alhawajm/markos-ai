import type { FastifyInstance } from "fastify";
import {
  approveBusinessProfileSchema,
  audienceOnboardingSchema,
  brandOnboardingSchema,
  companyOnboardingSchema,
  competitorsOnboardingSchema,
  createOnboardingDocumentAnalysisSchema,
  createOfferingDocumentAnalysisSchema,
  objectivesOnboardingSchema,
  onboardingModuleSchema,
  productsOnboardingSchema,
  storyOnboardingSchema,
  approveOfferingDocumentAnalysisSchema,
  approveOnboardingDocumentAnalysisSchema
} from "@markos/validation";
import { z } from "zod";
import { AiServiceRequestError } from "../ai/request";
import { errorEnvelope, ok } from "../http/envelope";
import { MediaStorageError } from "../media/storage-service";
import {
  approveOfferingDocumentAnalysis,
  createOfferingDocumentAnalysis,
  discardOfferingDocumentAnalysis,
  getActiveOfferingDocumentAnalysis,
  OfferingDocumentAnalysisConflictError,
  OfferingDocumentAnalysisNotFoundError,
  OfferingDocumentInvalidError,
  retryOfferingDocumentAnalysis
} from "../offerings/offering-document-service";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { UsagePlanInactiveError, UsageQuotaExceededError } from "../usage/usage-service";
import {
  approveWorkspaceBusinessProfile,
  BusinessProfileAlreadyApprovedError,
  BusinessProfileContextIncompleteError,
  BusinessProfileNotFoundError,
  generateWorkspaceBusinessProfile
} from "./business-profile-service";
import {
  completeOnboarding,
  getOnboardingState,
  OnboardingIncompleteError,
  RequiredOnboardingModuleError,
  saveOnboardingModule,
  skipOnboardingModule
} from "./onboarding-service";
import {
  approveOnboardingDocumentAnalysis,
  createOnboardingDocumentAnalysis,
  discardOnboardingDocumentAnalysis,
  getActiveOnboardingDocumentAnalysis,
  OnboardingDocumentAnalysisConflictError,
  OnboardingDocumentAnalysisNotFoundError,
  OnboardingDocumentInvalidError,
  retryOnboardingDocumentAnalysis
} from "./onboarding-document-service";

const moduleSchemas = {
  company: companyOnboardingSchema,
  story: storyOnboardingSchema,
  products: productsOnboardingSchema,
  audience: audienceOnboardingSchema,
  competitors: competitorsOnboardingSchema,
  brand: brandOnboardingSchema,
  objectives: objectivesOnboardingSchema
};

const offeringDocumentAnalysisIdSchema = z.string().uuid();
const maxOfferingDocumentBodyBytes = 18 * 1024 * 1024;
const maxOnboardingDocumentBodyBytes = 28 * 1024 * 1024;

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

  app.get(
    "/v1/onboarding/products/document-analysis",
    {
      config: {
        workspaceRequired: true,
        permissions: ["onboarding:read"]
      }
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await getActiveOfferingDocumentAnalysis(workspaceId));
    }
  );

  app.get(
    "/v1/onboarding/document-analysis",
    {
      config: {
        workspaceRequired: true,
        permissions: ["onboarding:read"]
      }
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await getActiveOnboardingDocumentAnalysis(workspaceId));
    }
  );

  app.post(
    "/v1/onboarding/document-analysis",
    {
      bodyLimit: maxOnboardingDocumentBodyBytes,
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["onboarding:write"]
      }
    },
    async (request, reply) => {
      const parsed = createOnboardingDocumentAnalysisSchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid onboarding files", parsed.error.issues));

      const { workspaceId } = requireWorkspaceContext();
      try {
        return ok(await createOnboardingDocumentAnalysis(workspaceId, parsed.data));
      } catch (error) {
        return handleOnboardingDocumentError(error, reply);
      }
    }
  );

  app.post(
    "/v1/onboarding/document-analysis/:analysisId/retry",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["onboarding:write"]
      }
    },
    async (request, reply) => {
      const analysisId = offeringDocumentAnalysisIdSchema.safeParse((request.params as { analysisId?: string }).analysisId);
      if (!analysisId.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Document analysis id is invalid"));

      const { workspaceId } = requireWorkspaceContext();
      try {
        return ok(await retryOnboardingDocumentAnalysis(workspaceId, analysisId.data));
      } catch (error) {
        return handleOnboardingDocumentError(error, reply);
      }
    }
  );

  app.post(
    "/v1/onboarding/document-analysis/:analysisId/approve",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["onboarding:write"]
      }
    },
    async (request, reply) => {
      const analysisId = offeringDocumentAnalysisIdSchema.safeParse((request.params as { analysisId?: string }).analysisId);
      const parsed = approveOnboardingDocumentAnalysisSchema.safeParse(request.body ?? {});
      if (!analysisId.success || !parsed.success) {
        return reply
          .status(400)
          .send(errorEnvelope("VALIDATION_ERROR", "Invalid onboarding document approval", parsed.success ? undefined : parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();
      try {
        return ok(await approveOnboardingDocumentAnalysis(workspaceId, analysisId.data, parsed.data));
      } catch (error) {
        return handleOnboardingDocumentError(error, reply);
      }
    }
  );

  app.delete(
    "/v1/onboarding/document-analysis/:analysisId",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["onboarding:write"]
      }
    },
    async (request, reply) => {
      const analysisId = offeringDocumentAnalysisIdSchema.safeParse((request.params as { analysisId?: string }).analysisId);
      if (!analysisId.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Document analysis id is invalid"));

      const { workspaceId } = requireWorkspaceContext();
      try {
        return ok(await discardOnboardingDocumentAnalysis(workspaceId, analysisId.data));
      } catch (error) {
        return handleOnboardingDocumentError(error, reply);
      }
    }
  );

  app.post(
    "/v1/onboarding/products/document-analysis",
    {
      bodyLimit: maxOfferingDocumentBodyBytes,
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["onboarding:write"]
      }
    },
    async (request, reply) => {
      const parsed = createOfferingDocumentAnalysisSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid offering documents", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();
      try {
        return ok(await createOfferingDocumentAnalysis(workspaceId, parsed.data));
      } catch (error) {
        return handleOfferingDocumentError(error, reply);
      }
    }
  );

  app.post(
    "/v1/onboarding/products/document-analysis/:analysisId/retry",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["onboarding:write"]
      }
    },
    async (request, reply) => {
      const analysisId = offeringDocumentAnalysisIdSchema.safeParse((request.params as { analysisId?: string }).analysisId);
      if (!analysisId.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Document analysis id is invalid"));
      }

      const { workspaceId } = requireWorkspaceContext();
      try {
        return ok(await retryOfferingDocumentAnalysis(workspaceId, analysisId.data));
      } catch (error) {
        return handleOfferingDocumentError(error, reply);
      }
    }
  );

  app.post(
    "/v1/onboarding/products/document-analysis/:analysisId/approve",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["onboarding:write"]
      }
    },
    async (request, reply) => {
      const analysisId = offeringDocumentAnalysisIdSchema.safeParse((request.params as { analysisId?: string }).analysisId);
      const parsed = approveOfferingDocumentAnalysisSchema.safeParse(request.body ?? {});
      if (!analysisId.success || !parsed.success) {
        return reply
          .status(400)
          .send(errorEnvelope("VALIDATION_ERROR", "Invalid document analysis approval", parsed.success ? undefined : parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();
      try {
        return ok(
          await approveOfferingDocumentAnalysis(workspaceId, analysisId.data, parsed.data, {
            preserveApprovedProfile: editModePreservesApprovedProfile(request.query)
          })
        );
      } catch (error) {
        return handleOfferingDocumentError(error, reply);
      }
    }
  );

  app.delete(
    "/v1/onboarding/products/document-analysis/:analysisId",
    {
      config: {
        workspaceRequired: true,
        verifiedUserRequired: true,
        permissions: ["onboarding:write"]
      }
    },
    async (request, reply) => {
      const analysisId = offeringDocumentAnalysisIdSchema.safeParse((request.params as { analysisId?: string }).analysisId);
      if (!analysisId.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Document analysis id is invalid"));
      }

      const { workspaceId } = requireWorkspaceContext();
      try {
        return ok(await discardOfferingDocumentAnalysis(workspaceId, analysisId.data));
      } catch (error) {
        return handleOfferingDocumentError(error, reply);
      }
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
      return ok(
        await saveOnboardingModule(workspaceId, module.data, parsed.data as z.infer<ModuleSchema>, {
          preserveApprovedProfile: editModePreservesApprovedProfile(request.query)
        })
      );
    }
  );

  app.post(
    "/v1/onboarding/:module/skip",
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

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(
          await skipOnboardingModule(workspaceId, module.data, {
            preserveApprovedProfile: editModePreservesApprovedProfile(request.query)
          })
        );
      } catch (error) {
        if (error instanceof RequiredOnboardingModuleError) {
          return reply.status(409).send(errorEnvelope("ONBOARDING_MODULE_REQUIRED", error.message));
        }

        throw error;
      }
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

function editModePreservesApprovedProfile(query: unknown): boolean {
  return typeof query === "object" && query !== null && "preserveApprovedProfile" in query && query.preserveApprovedProfile === "true";
}

function handleOfferingDocumentError(error: unknown, reply: { status: (code: number) => { send: (payload: unknown) => unknown } }) {
  if (error instanceof OfferingDocumentInvalidError) {
    return reply.status(400).send(errorEnvelope("OFFERING_DOCUMENT_INVALID", error.message));
  }

  if (error instanceof OfferingDocumentAnalysisNotFoundError) {
    return reply.status(404).send(errorEnvelope("OFFERING_DOCUMENT_ANALYSIS_NOT_FOUND", error.message));
  }

  if (error instanceof OfferingDocumentAnalysisConflictError) {
    return reply.status(409).send(errorEnvelope("OFFERING_DOCUMENT_ANALYSIS_CONFLICT", error.message));
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

  if (error instanceof MediaStorageError) {
    return reply.status(503).send(errorEnvelope(error.code, "Temporary document storage is unavailable"));
  }

  throw error;
}

function handleOnboardingDocumentError(error: unknown, reply: { status: (code: number) => { send: (payload: unknown) => unknown } }) {
  if (error instanceof OnboardingDocumentInvalidError) {
    return reply.status(400).send(errorEnvelope("ONBOARDING_DOCUMENT_INVALID", error.message));
  }
  if (error instanceof OnboardingDocumentAnalysisNotFoundError) {
    return reply.status(404).send(errorEnvelope("ONBOARDING_DOCUMENT_ANALYSIS_NOT_FOUND", error.message));
  }
  if (error instanceof OnboardingDocumentAnalysisConflictError) {
    return reply.status(409).send(errorEnvelope("ONBOARDING_DOCUMENT_ANALYSIS_CONFLICT", error.message));
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
  if (error instanceof MediaStorageError) {
    return reply.status(503).send(errorEnvelope(error.code, "Temporary document storage is unavailable"));
  }
  throw error;
}
