import type { FastifyInstance, FastifyContextConfig } from "fastify";
import { quickOnboardingPreviewSchema, quickOnboardingConfirmSchema, instagramOnboardingSchema } from "@markos/validation";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { ok, errorEnvelope } from "../http/envelope";
import { AiServiceRequestError } from "../ai/request";
import { previewQuickOnboarding, confirmQuickOnboarding, QuickOnboardingConflict } from "./quick-onboarding-service";
import { readPublicInstagramSource, InstagramSourceError } from "./instagram-profile-source";
import { createOnboardingDocumentAnalysis } from "./onboarding-document-service";
import { handleOnboardingDocumentError } from "./onboarding-routes";
export async function registerQuickOnboardingRoutes(app: FastifyInstance) {
  const config: FastifyContextConfig = { workspaceRequired: true, verifiedUserRequired: true, permissions: ["onboarding:write"] };
  app.post("/v1/onboarding/quick/preview", { config }, async (request, reply) => {
    const parsed = quickOnboardingPreviewSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Add your business name and what you offer", parsed.error.issues));
    try {
      return ok(await previewQuickOnboarding(requireWorkspaceContext().workspaceId, parsed.data));
    } catch (e) {
      if (e instanceof QuickOnboardingConflict) return reply.status(409).send(errorEnvelope("ONBOARDING_SUMMARY_CHANGED", e.message));
      if (e instanceof AiServiceRequestError) return reply.status(e.statusCode).send(errorEnvelope(e.code, e.message));
      throw e;
    }
  });
  app.post("/v1/onboarding/quick/confirm", { config }, async (request, reply) => {
    const parsed = quickOnboardingConfirmSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Choose the prepared summary"));
    try {
      return ok(await confirmQuickOnboarding(requireWorkspaceContext().workspaceId, parsed.data.interactionId));
    } catch (e) {
      if (e instanceof QuickOnboardingConflict) return reply.status(409).send(errorEnvelope("ONBOARDING_SUMMARY_CHANGED", e.message));
      throw e;
    }
  });
  app.post("/v1/onboarding/instagram-analysis", { config }, async (request, reply) => {
    const parsed = instagramOnboardingSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Enter a public Instagram profile URL"));
    try {
      const source = await readPublicInstagramSource(parsed.data.url);
      return ok(await createOnboardingDocumentAnalysis(requireWorkspaceContext().workspaceId, source));
    } catch (e) {
      if (e instanceof InstagramSourceError) return reply.status(422).send(errorEnvelope(e.code, e.message));
      return handleOnboardingDocumentError(e, reply);
    }
  });
}
