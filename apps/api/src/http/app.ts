import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, { type FastifyInstance } from "fastify";
import type { HealthResponse } from "@markos/shared-types";
import { registerAdminRoutes } from "../admin/admin-routes";
import { registerAgentRoutes } from "../agents/agent-routes";
import { registerAnalyticsRoutes } from "../analytics/analytics-routes";
import { registerAuthRoutes } from "../auth/auth-routes";
import { assertVerificationEmailConfiguration } from "../auth/verification-email";
import { registerBillingRoutes } from "../billing/billing-routes";
import { registerCalendarRoutes } from "../calendar/calendar-routes";
import { env } from "../config/env";
import { registerContentRoutes } from "../content/content-routes";
import { getDeepHealth } from "../health/deep-health";
import { registerMediaRoutes } from "../media/media-routes";
import { registerMetaRoutes } from "../meta/meta-routes";
import { registerNotificationRoutes } from "../notifications/notification-routes";
import { initObservability } from "../observability/sentry";
import { registerOnboardingRoutes } from "../onboarding/onboarding-routes";
import { registerPromptRoutes } from "../prompts/prompt-routes";
import { registerPublishingRoutes } from "../publishing/publishing-routes";
import { registerCampaignRoutes } from "../campaign/campaign-routes";
import { getWorkspaceContext } from "../tenancy/workspace-context";
import { registerWorkspaceContext } from "../tenancy/workspace-plugin";
import { registerVaultRoutes } from "../vault/vault-routes";
import { registerWorkspaceRoutes } from "../workspace/workspace-routes";
import { errorEnvelope, ok } from "./envelope";
import { reportUnexpectedRequestError } from "./error-telemetry";

const devCorsOrigins = [
  env.WEB_BASE_URL,
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://172.18.128.1:3000",
  "http://10.0.0.202:3000"
];

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
  assertVerificationEmailConfiguration();
  initObservability();

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug"
    }
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: env.NODE_ENV === "development" ? Array.from(new Set(devCorsOrigins)) : env.WEB_BASE_URL,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]
  });
  await registerWorkspaceContext(app);
  await registerAdminRoutes(app);
  await registerAuthRoutes(app);
  await registerAgentRoutes(app);
  await registerAnalyticsRoutes(app);
  await registerBillingRoutes(app);
  await registerCalendarRoutes(app);
  await registerOnboardingRoutes(app);
  await registerCampaignRoutes(app);
  await registerContentRoutes(app);
  await registerMediaRoutes(app);
  await registerMetaRoutes(app);
  await registerNotificationRoutes(app);
  await registerPromptRoutes(app);
  await registerPublishingRoutes(app);
  await registerWorkspaceRoutes(app);
  await registerVaultRoutes(app);

  app.setErrorHandler((error, request, reply) => {
    const details = getErrorDetails(error);
    const statusCode = details.statusCode;

    if (statusCode >= 500) {
      const workspaceId = getWorkspaceContext()?.workspaceId;
      reportUnexpectedRequestError({
        error,
        logger: app.log,
        method: request.method,
        url: request.url,
        ...(workspaceId ? { workspaceId } : {})
      });
    } else {
      app.log.warn(
        {
          err: error,
          method: request.method,
          url: request.url.split("?", 1)[0]
        },
        "Request failed"
      );
    }

    void reply
      .status(statusCode)
      .send(
        errorEnvelope(details.code ?? (statusCode >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR"), statusCode >= 500 ? "Unexpected server error" : details.message)
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
        workspaceRequired: true,
        permissions: ["workspace:read"]
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
