import type { FastifyInstance } from "fastify";
import type { Permission, Role } from "@markos/shared-types";
import { prisma } from "../db/prisma";
import { isMfaStepUpActive, verifyAccessToken } from "../auth/tokens";
import { hasPermissions } from "../auth/rbac";
import { errorEnvelope } from "../http/envelope";
import {
  runWorkspaceContextScope,
  setWorkspaceContext,
} from "./workspace-context";
import {
  INSTAGRAM_CONNECTION_STATUS_FAILURE_EVENT,
  INSTAGRAM_OAUTH_START_FAILURE_EVENT,
  reportInstagramOAuthFailure,
} from "../workspace/instagram-oauth-telemetry";

declare module "fastify" {
  interface FastifyContextConfig {
    mfaRequired?: boolean;
    permissions?: Permission[];
    verifiedUserRequired?: boolean;
    workspaceRequired?: boolean;
    instagramOAuthBoundary?: "start" | "status";
  }

  interface FastifyRequest {
    auth?: {
      isVerified: boolean;
      mfaVerified: boolean;
      mfaVerifiedUntil: number | null;
      userId: string;
      workspaceId: string;
      roles: Role[];
    };
  }
}

export async function registerWorkspaceContext(
  app: FastifyInstance,
): Promise<void> {
  app.addHook("onRequest", (_request, _reply, done) => {
    runWorkspaceContextScope(done);
  });

  app.addHook("preHandler", async (request, reply) => {
    if (request.routeOptions.config.workspaceRequired !== true) {
      return;
    }

    const token = getBearerToken(request.headers.authorization);
    const boundary = request.routeOptions.config.instagramOAuthBoundary;
    const reportBoundaryFailure = (
      authentication: boolean,
      category: string,
    ) => {
      if (!boundary) return;
      reportInstagramOAuthFailure({
        event:
          boundary === "start"
            ? INSTAGRAM_OAUTH_START_FAILURE_EVENT
            : INSTAGRAM_CONNECTION_STATUS_FAILURE_EVENT,
        logger: app.log,
        requestId: request.id,
        diagnostic: {
          stage:
            boundary === "start"
              ? authentication
                ? "start_authentication"
                : "start_workspace_authorization"
              : authentication
                ? "connection_status_authentication"
                : "connection_status_authorization",
          category,
          retryable: false,
        },
      });
    };

    if (token === undefined) {
      reportBoundaryFailure(true, "authentication_required");
      await reply
        .status(401)
        .send(
          errorEnvelope("AUTH_REQUIRED", "A valid bearer token is required"),
        );
      return;
    }

    try {
      const principal = await verifyAccessToken(token);
      const membership = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId: principal.workspaceId,
          userId: principal.userId,
          deletedAt: null,
        },
        select: {
          role: true,
        },
      });
      const user = await prisma.user.findUnique({
        where: {
          id: principal.userId,
        },
        select: {
          deletedAt: true,
          isVerified: true,
          mfaEnabled: true,
        },
      });

      if (membership === null) {
        reportBoundaryFailure(false, "workspace_forbidden");
        await reply
          .status(403)
          .send(
            errorEnvelope(
              "WORKSPACE_FORBIDDEN",
              "User is not a member of this workspace",
            ),
          );
        return;
      }

      if (user === null || user.deletedAt !== null) {
        reportBoundaryFailure(true, "authentication_invalid");
        await reply
          .status(401)
          .send(errorEnvelope("USER_NOT_ACTIVE", "User is not active"));
        return;
      }

      const auth = {
        isVerified: user.isVerified,
        mfaVerified: principal.mfaVerified ?? false,
        mfaVerifiedUntil: principal.mfaVerifiedUntil ?? null,
        userId: principal.userId,
        workspaceId: principal.workspaceId,
        roles: [membership.role as Role],
      };

      request.auth = auth;
      setWorkspaceContext(auth);

      const permissions = request.routeOptions.config.permissions ?? [];

      if (permissions.length > 0 && !hasPermissions(auth.roles, permissions)) {
        reportBoundaryFailure(false, "workspace_forbidden");
        await reply.status(403).send(
          errorEnvelope(
            "RBAC_FORBIDDEN",
            "This role does not have permission to perform this action",
            [
              {
                requiredPermissions: permissions,
                roles: auth.roles,
              },
            ],
          ),
        );
        return;
      }

      if (
        request.routeOptions.config.verifiedUserRequired === true &&
        !auth.isVerified
      ) {
        await reply
          .status(403)
          .send(
            errorEnvelope(
              "EMAIL_VERIFICATION_REQUIRED",
              "Email verification is required before this action",
            ),
          );
        return;
      }

      if (
        request.routeOptions.config.mfaRequired === true &&
        !(auth.mfaVerified && isMfaStepUpActive(auth.mfaVerifiedUntil))
      ) {
        reportBoundaryFailure(
          true,
          user.mfaEnabled ? "mfa_required" : "mfa_setup_required",
        );
        await reply
          .status(403)
          .send(
            errorEnvelope(
              user.mfaEnabled ? "MFA_REQUIRED" : "MFA_SETUP_REQUIRED",
              user.mfaEnabled
                ? "MFA verification is required before this action"
                : "TOTP MFA must be enabled before this action",
            ),
          );
        return;
      }
    } catch {
      reportBoundaryFailure(true, "authentication_invalid");
      await reply
        .status(401)
        .send(
          errorEnvelope("INVALID_TOKEN", "Bearer token is invalid or expired"),
        );
    }
  });
}

function getBearerToken(authorization: string | undefined): string | undefined {
  if (authorization === undefined) {
    return undefined;
  }

  const [scheme, token] = authorization.split(" ");

  if (
    scheme?.toLowerCase() !== "bearer" ||
    token === undefined ||
    token.length === 0
  ) {
    return undefined;
  }

  return token;
}
