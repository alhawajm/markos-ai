import type { FastifyInstance, FastifyReply } from "fastify";
import { connectInstagramSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { env } from "../config/env";
import {
  completeInstagramOAuth,
  createInstagramOAuthStart,
  InstagramOAuthConfigurationError,
  InstagramOAuthExchangeError,
  InstagramOAuthStateError
} from "./instagram-oauth-service";
import { refreshInstagramTokenForWorkspace } from "./instagram-token-service";
import {
  connectInstagram,
  ContentItemNotFoundForReadinessError,
  disconnectInstagram,
  getInstagramConnection,
  listWorkspaceAuditLogs,
  getPublishReadiness,
  WorkspaceNotFoundError
} from "./workspace-service";

export async function registerWorkspaceRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/v1/workspace/instagram/oauth/start",
    {
      config: {
        workspaceRequired: true,
        permissions: ["instagram:manage"]
      }
    },
    async (request, reply) => {
      const { userId, workspaceId } = requireWorkspaceContext();
      const body = request.body as { locale?: "ar" | "en" } | undefined;
      const locale = body?.locale === "ar" || body?.locale === "en" ? body.locale : undefined;

      try {
        return ok(
          await createInstagramOAuthStart({
            ...(locale === undefined ? {} : { locale }),
            userId,
            workspaceId
          })
        );
      } catch (error) {
        if (error instanceof InstagramOAuthConfigurationError) {
          return reply
            .status(409)
            .send(errorEnvelope("INSTAGRAM_OAUTH_NOT_CONFIGURED", error.message, error.reasons));
        }

        throw error;
      }
    }
  );

  app.get("/v1/workspace/instagram/oauth/callback", async (request, reply) => {
    const query = request.query as { code?: string; error?: string; state?: string };
    const acceptsJson = request.headers.accept?.includes("application/json") ?? false;

    if (query.error) {
      return sendInstagramOAuthCallbackError(reply, acceptsJson, query.error);
    }

    if (!query.code || !query.state) {
      return sendInstagramOAuthCallbackError(reply, acceptsJson, "Missing Instagram OAuth callback parameters");
    }

    try {
      const result = await completeInstagramOAuth({
        code: query.code,
        state: query.state
      });

      if (acceptsJson) {
        return ok(result.connection);
      }

      return reply.redirect(getSettingsRedirectUrl("connected", result.locale));
    } catch (error) {
      if (
        error instanceof InstagramOAuthConfigurationError ||
        error instanceof InstagramOAuthStateError ||
        error instanceof InstagramOAuthExchangeError
      ) {
        return sendInstagramOAuthCallbackError(reply, acceptsJson, error.message);
      }

      throw error;
    }
  });

  app.get(
    "/v1/workspace/instagram",
    {
      config: {
        workspaceRequired: true,
        permissions: ["workspace:read"]
      }
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await getInstagramConnection(workspaceId));
    }
  );

  app.put(
    "/v1/workspace/instagram",
    {
      config: {
        workspaceRequired: true,
        permissions: ["instagram:manage"]
      }
    },
    async (request, reply) => {
      const parsed = connectInstagramSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid Instagram connection request", parsed.error.issues));
      }

      const { userId, workspaceId } = requireWorkspaceContext();
      return ok(await connectInstagram(workspaceId, parsed.data, { actorId: userId }));
    }
  );

  app.delete(
    "/v1/workspace/instagram",
    {
      config: {
        workspaceRequired: true,
        permissions: ["instagram:manage"]
      }
    },
    async () => {
      const { userId, workspaceId } = requireWorkspaceContext();
      return ok(await disconnectInstagram(workspaceId, { actorId: userId }));
    }
  );

  app.post(
    "/v1/workspace/instagram/refresh",
    {
      config: {
        workspaceRequired: true,
        permissions: ["instagram:manage"]
      }
    },
    async () => {
      const { userId, workspaceId } = requireWorkspaceContext();
      return ok(await refreshInstagramTokenForWorkspace({ actorId: userId, workspaceId }));
    }
  );

  app.get(
    "/v1/workspace/audit-logs",
    {
      config: {
        workspaceRequired: true,
        permissions: ["workspace:audit:read"]
      }
    },
    async (request, reply) => {
      const { workspaceId } = requireWorkspaceContext();
      const query = request.query as { limit?: string };
      const rawLimit = query.limit === undefined ? undefined : Number(query.limit);

      if (rawLimit !== undefined && (!Number.isInteger(rawLimit) || rawLimit < 1)) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Audit log limit must be a positive integer"));
      }

      return ok(await listWorkspaceAuditLogs(workspaceId, rawLimit === undefined ? {} : { limit: rawLimit }));
    }
  );

  app.get(
    "/v1/workspace/publish-readiness/:contentItemId",
    {
      config: {
        workspaceRequired: true,
        permissions: ["workspace:read"]
      }
    },
    async (request, reply) => {
      const params = request.params as { contentItemId?: string };

      if (!params.contentItemId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Content item id is required"));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await getPublishReadiness(workspaceId, params.contentItemId));
      } catch (error) {
        if (error instanceof ContentItemNotFoundForReadinessError) {
          return reply.status(404).send(errorEnvelope("CONTENT_NOT_FOUND", error.message));
        }

        if (error instanceof WorkspaceNotFoundError) {
          return reply.status(404).send(errorEnvelope("WORKSPACE_NOT_FOUND", error.message));
        }

        throw error;
      }
    }
  );
}

function sendInstagramOAuthCallbackError(
  reply: FastifyReply,
  acceptsJson: boolean,
  message: string
) {
  if (acceptsJson) {
    return reply.status(400).send(errorEnvelope("INSTAGRAM_OAUTH_FAILED", message));
  }

  return reply.redirect(getSettingsRedirectUrl("error"));
}

function getSettingsRedirectUrl(status: "connected" | "error", locale: "ar" | "en" = "en"): string {
  const url = new URL(`/${locale}/settings`, env.WEB_BASE_URL);
  url.searchParams.set("instagram", status);
  return url.toString();
}
