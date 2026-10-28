import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { canReadContentReports, canReviewContentReports, contentReportStatuses } from "@markos/shared-types";
import { contentReportSchema, contentReportReviewSchema } from "@markos/validation";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { errorEnvelope, ok } from "../http/envelope";
import { submitContentReport, listContentReports, reviewContentReport, contentReportMedia } from "./content-report-service";

export async function registerContentReportRoutes(app: FastifyInstance) {
  app.get("/v1/admin/content-reports/:id/media", { config: { workspaceRequired: true, permissions: ["admin:read"] } }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    if (!canReadContentReports(requireWorkspaceContext().roles)) return reply.code(403).send(errorEnvelope("FORBIDDEN", "Moderation access is required."));
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid report."));
    return ok(await contentReportMedia(params.data.id));
  });
  app.post(
    "/v1/content-reports",
    { config: { workspaceRequired: true, verifiedUserRequired: true, permissions: ["content:read"] } },
    async (request, reply) => {
      reply.header("Cache-Control", "private, no-store");
      const input = contentReportSchema.safeParse(request.body);
      if (!input.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Choose the content, a reason and a valid explanation."));
      const { workspaceId, userId } = requireWorkspaceContext();
      return reply.code(201).send(ok(await submitContentReport(workspaceId, userId, { ...input.data, sourceId: input.data.sourceId ?? null })));
    }
  );
  app.get("/v1/admin/content-reports", { config: { workspaceRequired: true, permissions: ["admin:read"] } }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    if (!canReadContentReports(requireWorkspaceContext().roles)) return reply.code(403).send(errorEnvelope("FORBIDDEN", "Moderation access is required."));
    const input = z
      .object({ status: z.enum(contentReportStatuses).default("OPEN"), limit: z.coerce.number().int().min(1).max(100).default(25) })
      .strict()
      .safeParse(request.query);
    if (!input.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid report filter."));
    return ok(await listContentReports(input.data.status, input.data.limit));
  });
  app.post(
    "/v1/admin/content-reports/:id/review",
    { config: { workspaceRequired: true, verifiedUserRequired: true, permissions: ["admin:manage"] } },
    async (request, reply) => {
      reply.header("Cache-Control", "private, no-store");
      const { userId, roles } = requireWorkspaceContext();
      if (!canReviewContentReports(roles)) return reply.code(403).send(errorEnvelope("FORBIDDEN", "Content moderation permission is required."));
      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      const input = contentReportReviewSchema.safeParse(request.body);
      if (!params.success || !input.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Choose a decision and explain the action taken."));
      return ok(await reviewContentReport(params.data.id, userId, input.data));
    }
  );
}
