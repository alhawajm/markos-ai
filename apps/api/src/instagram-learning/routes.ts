import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { analyzeInstagramLearning, approveInstagramLearning, getInstagramLearning, skipInstagramLearning, startInstagramLearning } from "./service";
import { learningApprovalSchema } from "./contracts";

export async function registerInstagramLearningRoutes(app: FastifyInstance) {
  const read = { workspaceRequired: true, verifiedUserRequired: true, permissions: ["vault:read" as const] };
  const write = { ...read, permissions: ["vault:write" as const, "instagram:manage" as const] };
  app.get("/v1/workspace/instagram/learning", { config: read }, async () => ok(await getInstagramLearning(requireWorkspaceContext().workspaceId)));
  app.post("/v1/workspace/instagram/learning", { config: write }, async () => ok(await startInstagramLearning(requireWorkspaceContext().workspaceId)));
  app.post("/v1/workspace/instagram/learning/:id/analyze", { config: write }, async (request, reply) => {
    const id = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z
      .object({ locale: z.enum(["en", "ar"]) })
      .strict()
      .safeParse(request.body);
    if (!id.success || !body.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Check the exploration request."));
    return ok(await analyzeInstagramLearning(requireWorkspaceContext().workspaceId, id.data.id, body.data.locale));
  });
  app.post("/v1/workspace/instagram/learning/:id/approve", { config: write }, async (request, reply) => {
    const id = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = learningApprovalSchema.safeParse(request.body);
    if (!id.success || !body.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Check the reviewed profile changes."));
    return ok(await approveInstagramLearning(requireWorkspaceContext().workspaceId, id.data.id, body.data));
  });
  app.post("/v1/workspace/instagram/learning/:id/skip", { config: write }, async (request, reply) => {
    const id = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!id.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Check the exploration request."));
    return ok(await skipInstagramLearning(requireWorkspaceContext().workspaceId, id.data.id));
  });
}
