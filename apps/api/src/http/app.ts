import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, { type FastifyInstance } from "fastify";
import type { HealthResponse } from "@markos/shared-types";
import { registerAuthRoutes } from "../auth/auth-routes";
import { env } from "../config/env";
import { getDeepHealth } from "../health/deep-health";
import { getWorkspaceContext } from "../tenancy/workspace-context";
import { registerWorkspaceContext } from "../tenancy/workspace-plugin";
import { registerVaultRoutes } from "../vault/vault-routes";
import { errorEnvelope, ok } from "./envelope";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug"
    }
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: env.WEB_BASE_URL,
    credentials: true
  });
  await registerWorkspaceContext(app);
  await registerAuthRoutes(app);
  await registerVaultRoutes(app);

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    void reply.status(500).send(errorEnvelope("INTERNAL_ERROR", "Unexpected server error"));
  });

  app.get("/v1/health", async () => {
    const response: HealthResponse = {
      service: "api",
      status: "ok",
      timestamp: new Date().toISOString()
    };

    return ok(response);
  });

  app.get("/v1/health/deep", async () => {
    return ok(await getDeepHealth());
  });

  app.get(
    "/v1/workspace-context",
    {
      config: {
        workspaceRequired: true
      }
    },
    async () => {
      const context = getWorkspaceContext();

      return ok({
        workspaceId: context?.workspaceId,
        userId: context?.userId,
        roles: context?.roles
      });
    }
  );

  return app;
}
