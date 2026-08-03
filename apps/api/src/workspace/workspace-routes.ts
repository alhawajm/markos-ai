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
  reportInstagramOAuthCallbackFailure,
  type InstagramOAuthFailureDiagnostic,
} from "./instagram-oauth-telemetry";
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
        let returnTo: string | undefined;
        let diagnostic: InstagramOAuthFailureDiagnostic = {
          stage: "callback_input",
          category: "authorization_denied",
          retryable: false,
        };
        try {
          returnTo = await cancelInstagramOAuth(query.state);
        } catch (error) {
          if (error instanceof InstagramOAuthStateError)
            diagnostic = error.diagnostic;
          // Always return the same sanitized denial response.
        }
        reportInstagramOAuthCallbackFailure({
          logger: app.log,
          requestId: request.id,
          diagnostic,
        });
        if (!acceptsJson && returnTo) {
          const url = new URL(returnTo, env.WEB_BASE_URL);
          url.searchParams.set("instagram", "error");
          return reply.redirect(url.toString());
        }
        return sendInstagramOAuthCallbackError(reply, acceptsJson);
      }

      if (!query.code || !query.state) {
        reportInstagramOAuthCallbackFailure({
          logger: app.log,
          requestId: request.id,
          diagnostic: {
            stage: "callback_input",
            category: "missing_callback_parameters",
            retryable: false,
          },
        });
        return sendInstagramOAuthCallbackError(reply, acceptsJson);
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
        const diagnostic: InstagramOAuthFailureDiagnostic =
          error instanceof InstagramOAuthStateError ||
          error instanceof InstagramOAuthExchangeError
            ? error.diagnostic
            : error instanceof InstagramOAuthConfigurationError
              ? {
                  stage: "callback_input",
                  category: "oauth_configuration_invalid",
                  retryable: false,
                }
              : {
                  stage: "credential_persistence",
                  category: "unexpected_internal_failure",
                  retryable: false,
                };
        reportInstagramOAuthCallbackFailure({
          logger: app.log,
          requestId: request.id,
          diagnostic,
        });
        return sendInstagramOAuthCallbackError(reply, acceptsJson);
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
      const { userId, workspaceId } = requireWorkspaceContext();
      return ok(await refreshSecureInstagram({ workspaceId, actorId: userId }));
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
) {
  if (acceptsJson) {
    return reply
      .status(400)
      .send(
        errorEnvelope(
          "INSTAGRAM_OAUTH_FAILED",
          "Instagram authorization could not be completed",
        ),
      );
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
