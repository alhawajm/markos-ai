import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { errorEnvelope } from "../http/envelope";
import { setWorkspaceContext } from "./workspace-context";

declare module "fastify" {
  interface FastifyContextConfig {
    workspaceRequired?: boolean;
  }
}

const workspaceIdSchema = z.string().uuid();

export async function registerWorkspaceContext(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (request, reply) => {
    if (request.routeOptions.config.workspaceRequired !== true) {
      return;
    }

    const header = request.headers["x-workspace-id"];
    const workspaceId = Array.isArray(header) ? header[0] : header;
    const parsed = workspaceIdSchema.safeParse(workspaceId);

    if (!parsed.success) {
      await reply
        .status(400)
        .send(errorEnvelope("WORKSPACE_REQUIRED", "A valid X-Workspace-Id header is required"));
      return;
    }

    setWorkspaceContext({ workspaceId: parsed.data });
  });
}
