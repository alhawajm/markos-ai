import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { offeringMaintenanceSchema, updateBusinessKnowledgeSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { maintainOffering, saveOfferingCatalog } from "../offerings/offering-catalog-service";
import { getBusinessKnowledge, listBusinessKnowledgeHistory, saveBusinessKnowledge } from "./knowledge-service";

export async function registerBusinessKnowledgeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/business-profile/history/:module", { config: { workspaceRequired: true, permissions: ["vault:read"] } }, async (request, reply) => {
    const parsed = updateBusinessKnowledgeSchema.shape.module.safeParse((request.params as { module?: string }).module);
    if (!parsed.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Choose a business profile section."));
    return ok(await listBusinessKnowledgeHistory(requireWorkspaceContext().workspaceId, parsed.data));
  });
  app.patch(
    "/v1/business-profile/catalog",
    { config: { workspaceRequired: true, verifiedUserRequired: true, permissions: ["vault:write"] } },
    async (request, reply) => {
      const parsed = z
        .object({
          expectedVersion: z.number().int().nonnegative(),
          summary: z.string().max(4000).optional(),
          differentiators: z.array(z.string().min(1).max(160)).max(20).optional(),
          priceRange: z.string().max(120).optional(),
          salesChannels: z.array(z.string().min(1).max(80)).max(12).optional()
        })
        .strict()
        .safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Check the catalog fields", parsed.error.issues));
      const { workspaceId } = requireWorkspaceContext();
      if (!(await getBusinessKnowledge(workspaceId)).approved) return reply.code(409).send(errorEnvelope("ONBOARDING_REQUIRED", "Complete onboarding first."));
      await saveOfferingCatalog(workspaceId, parsed.data, { indexImmediately: false });
      return ok(await getBusinessKnowledge(workspaceId));
    }
  );
  app.get("/v1/business-profile", { config: { workspaceRequired: true, permissions: ["vault:read"] } }, async () =>
    ok(await getBusinessKnowledge(requireWorkspaceContext().workspaceId))
  );
  app.patch(
    "/v1/business-profile",
    { config: { workspaceRequired: true, verifiedUserRequired: true, permissions: ["vault:write"] } },
    async (request, reply) => {
      const parsed = updateBusinessKnowledgeSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Check the profile fields", parsed.error.issues));
      const { workspaceId } = requireWorkspaceContext();
      await saveBusinessKnowledge(workspaceId, parsed.data);
      return ok(await getBusinessKnowledge(workspaceId));
    }
  );
  app.put(
    "/v1/business-profile/offerings",
    { config: { workspaceRequired: true, verifiedUserRequired: true, permissions: ["vault:write"] } },
    async (request, reply) => {
      const parsed = offeringMaintenanceSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Check the offering fields", parsed.error.issues));
      const { workspaceId } = requireWorkspaceContext();
      await maintainOffering(workspaceId, parsed.data);
      return ok(await getBusinessKnowledge(workspaceId));
    }
  );
}
