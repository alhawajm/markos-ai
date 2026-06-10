import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, { type FastifyInstance } from "fastify";
import type { HealthResponse } from "@markos/shared-types";
import { registerAuthRoutes } from "../auth/auth-routes";
import { env } from "../config/env";
import { registerContentRoutes } from "../content/content-routes";
import { getDeepHealth } from "../health/deep-health";
import { registerOnboardingRoutes } from "../onboarding/onboarding-routes";
import { registerStrategyRoutes } from "../strategy/strategy-routes";
import { getWorkspaceContext } from "../tenancy/workspace-context";
import { registerWorkspaceContext } from "../tenancy/workspace-plugin";
import { registerVaultRoutes } from "../vault/vault-routes";
import { registerWorkspaceRoutes } from "../workspace/workspace-routes";
import { errorEnvelope, ok } from "./envelope";

function getErrorDetails(error: unknown): { code?: string; message: string; statusCode: number } {
  if (typeof error !== "object" || error === null) {
    return {
      message: "Unexpected server error",
      statusCode: 500
    };
  }

  const maybeError = error as { code?: unknown; message?: unknown; statusCode?: unknown };
  const details = {
    message: typeof maybeError.message === "string" ? maybeError.message : "Unexpected server error",
    statusCode: typeof maybeError.statusCode === "number" ? maybeError.statusCode : 500
  };

  return typeof maybeError.code === "string" ? { ...details, code: maybeError.code } : details;
}

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
  await registerOnboardingRoutes(app);
  await registerStrategyRoutes(app);
  await registerContentRoutes(app);
  await registerWorkspaceRoutes(app);
  await registerVaultRoutes(app);

  app.setErrorHandler((error, request, reply) => {
    const details = getErrorDetails(error);
    const statusCode = details.statusCode;

    if (statusCode >= 500) {
      request.log.error(error);
    } else {
      request.log.warn(error);
    }

    void reply
      .status(statusCode)
      .send(
        errorEnvelope(
          details.code ?? (statusCode >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR"),
          statusCode >= 500 ? "Unexpected server error" : details.message
        )
      );
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
