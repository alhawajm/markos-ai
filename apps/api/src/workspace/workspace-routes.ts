import type { FastifyInstance, FastifyReply } from "fastify";
import { eraseWorkspaceDataSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { env } from "../config/env";
import {
  eraseWorkspaceData,
  exportWorkspaceData,
  WorkspaceDataErasureNotFoundError,
  WorkspaceDataExportNotFoundError,
} from "./pdpl-service";
import {
  cancelInstagramOAuth,
  completeInstagramOAuth,
  createInstagramOAuthStart,
  InstagramOAuthConfigurationError,
  InstagramOAuthExchangeError,
  InstagramOAuthStateError,
} from "./instagram-oauth-service";
import {
  disconnectSecureInstagram,
  getSecureInstagramConnection,
  refreshSecureInstagram,
} from "./instagram-connection-service";
import {
  ContentItemNotFoundForReadinessError,
  listWorkspaceAuditLogs,
  getPublishReadiness,
  WorkspaceNotFoundError,
} from "./workspace-service";

export async function registerWorkspaceRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    "/v1/workspace/instagram/oauth/start",
    {
      config: {
        workspaceRequired: true,
        permissions: ["instagram:manage"],
      },
    },
    async (request, reply) => {
      const { userId, workspaceId } = requireWorkspaceContext();
      const body = request.body as
        | { locale?: "ar" | "en"; returnTo?: string }
        | undefined;
      const locale =
        body?.locale === "ar" || body?.locale === "en"
          ? body.locale
          : undefined;

      try {
        return ok(
          await createInstagramOAuthStart({
            ...(locale === undefined ? {} : { locale }),
            userId,
            workspaceId,
            ...(body?.returnTo ? { returnTo: body.returnTo } : {}),
          }),
        );
      } catch (error) {
        if (error instanceof InstagramOAuthConfigurationError) {
          return reply
            .status(409)
            .send(
              errorEnvelope(
                "INSTAGRAM_OAUTH_NOT_CONFIGURED",
                error.message,
                error.reasons,
              ),
            );
        }

        throw error;
      }
    },
  );

  app.get(
    "/v1/workspace/instagram/oauth/callback",
    { logLevel: "silent" },
    async (request, reply) => {
      const query = request.query as {
        code?: string;
        error?: string;
        state?: string;
      };
      const acceptsJson =
        request.headers.accept?.includes("application/json") ?? false;

      if (query.error && query.state) {
        try {
          const returnTo = await cancelInstagramOAuth(query.state);
          if (!acceptsJson) {
            const url = new URL(returnTo, env.WEB_BASE_URL);
            url.searchParams.set("instagram", "error");
            return reply.redirect(url.toString());
          }
        } catch {
          // Always return the same sanitized denial response.
        }
        return sendInstagramOAuthCallbackError(
          reply,
          acceptsJson,
          "Instagram authorization was cancelled or denied",
        );
      }

      if (!query.code || !query.state) {
        return sendInstagramOAuthCallbackError(
          reply,
          acceptsJson,
          "Missing Instagram OAuth callback parameters",
        );
      }

      try {
        const result = await completeInstagramOAuth({
          code: query.code,
          state: query.state,
        });

        if (acceptsJson) {
          return ok(result.connection);
        }

        const url = new URL(result.returnTo, env.WEB_BASE_URL);
        url.searchParams.set("instagram", "connected");
        return reply.redirect(url.toString());
      } catch (error) {
        if (
          error instanceof InstagramOAuthConfigurationError ||
          error instanceof InstagramOAuthStateError ||
          error instanceof InstagramOAuthExchangeError
        ) {
          return sendInstagramOAuthCallbackError(
            reply,
            acceptsJson,
            error.message,
          );
        }

        throw error;
      }
    },
  );

  app.get(
    "/v1/workspace/instagram",
    {
      config: {
        workspaceRequired: true,
        permissions: ["workspace:read"],
      },
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await getSecureInstagramConnection(workspaceId));
    },
  );

  app.delete(
    "/v1/workspace/instagram",
    {
      config: {
        workspaceRequired: true,
        permissions: ["instagram:manage"],
      },
    },
    async () => {
      const { userId, workspaceId } = requireWorkspaceContext();
      return ok(await disconnectSecureInstagram(workspaceId, userId));
    },
  );

  app.post(
    "/v1/workspace/instagram/refresh",
    {
      config: {
        workspaceRequired: true,
        permissions: ["instagram:manage"],
      },
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await refreshSecureInstagram({ workspaceId }));
    },
  );

  app.get(
    "/v1/workspace/audit-logs",
    {
      config: {
        workspaceRequired: true,
        permissions: ["workspace:audit:read"],
      },
    },
    async (request, reply) => {
      const { workspaceId } = requireWorkspaceContext();
      const query = request.query as { limit?: string };
      const rawLimit =
        query.limit === undefined ? undefined : Number(query.limit);

      if (
        rawLimit !== undefined &&
        (!Number.isInteger(rawLimit) || rawLimit < 1)
      ) {
        return reply
          .status(400)
          .send(
            errorEnvelope(
              "VALIDATION_ERROR",
              "Audit log limit must be a positive integer",
            ),
          );
      }

      return ok(
        await listWorkspaceAuditLogs(
          workspaceId,
          rawLimit === undefined ? {} : { limit: rawLimit },
        ),
      );
    },
  );

  app.get(
    "/v1/workspace/data-export",
    {
      config: {
        workspaceRequired: true,
        permissions: ["workspace:data:export"],
      },
    },
    async (_request, reply) => {
      const { workspaceId } = requireWorkspaceContext();

      try {
        const data = await exportWorkspaceData(workspaceId);
        return reply
          .header(
            "content-disposition",
            `attachment; filename="markos-workspace-${workspaceId}-export.json"`,
          )
          .send(ok(data));
      } catch (error) {
        if (error instanceof WorkspaceDataExportNotFoundError) {
          return reply
            .status(404)
            .send(errorEnvelope("WORKSPACE_DATA_NOT_FOUND", error.message));
        }

        throw error;
      }
    },
  );

  app.post(
    "/v1/workspace/data-erasure",
    {
      config: {
        workspaceRequired: true,
        permissions: ["workspace:data:erase"],
      },
    },
    async (request, reply) => {
      const parsed = eraseWorkspaceDataSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply
          .status(400)
          .send(
            errorEnvelope(
              "VALIDATION_ERROR",
              "Invalid workspace data erasure request",
              parsed.error.issues,
            ),
          );
      }

      const { userId, workspaceId } = requireWorkspaceContext();

      try {
        return ok(await eraseWorkspaceData({ actorId: userId, workspaceId }));
      } catch (error) {
        if (error instanceof WorkspaceDataErasureNotFoundError) {
          return reply
            .status(404)
            .send(errorEnvelope("WORKSPACE_DATA_NOT_FOUND", error.message));
        }

        throw error;
      }
    },
  );

  app.get(
    "/v1/workspace/publish-readiness/:contentItemId",
    {
      config: {
        workspaceRequired: true,
        permissions: ["workspace:read"],
      },
    },
    async (request, reply) => {
      const params = request.params as { contentItemId?: string };

      if (!params.contentItemId) {
        return reply
          .status(400)
          .send(
            errorEnvelope("VALIDATION_ERROR", "Content item id is required"),
          );
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await getPublishReadiness(workspaceId, params.contentItemId));
      } catch (error) {
        if (error instanceof ContentItemNotFoundForReadinessError) {
          return reply
            .status(404)
            .send(errorEnvelope("CONTENT_NOT_FOUND", error.message));
        }

        if (error instanceof WorkspaceNotFoundError) {
          return reply
            .status(404)
            .send(errorEnvelope("WORKSPACE_NOT_FOUND", error.message));
        }

        throw error;
      }
    },
  );
}

function sendInstagramOAuthCallbackError(
  reply: FastifyReply,
  acceptsJson: boolean,
  message: string,
) {
  if (acceptsJson) {
    return reply
      .status(400)
      .send(errorEnvelope("INSTAGRAM_OAUTH_FAILED", message));
  }

  return reply.redirect(getSettingsRedirectUrl("error"));
}

function getSettingsRedirectUrl(
  status: "connected" | "error",
  locale: "ar" | "en" = "en",
): string {
  const url = new URL(`/${locale}/app/settings`, env.WEB_BASE_URL);
  url.searchParams.set("instagram", status);
  return url.toString();
}
