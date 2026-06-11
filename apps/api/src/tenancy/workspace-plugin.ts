import type { FastifyInstance } from "fastify";
import type { Permission, Role } from "@markos/shared-types";
import { prisma } from "../db/prisma";
import { verifyAccessToken } from "../auth/tokens";
import { hasPermissions } from "../auth/rbac";
import { errorEnvelope } from "../http/envelope";
import { runWorkspaceContextScope, setWorkspaceContext } from "./workspace-context";

declare module "fastify" {
  interface FastifyContextConfig {
    workspaceRequired?: boolean;
    permissions?: Permission[];
  }

  interface FastifyRequest {
    auth?: {
      userId: string;
      workspaceId: string;
      roles: Role[];
    };
  }
}

export async function registerWorkspaceContext(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", (_request, _reply, done) => {
    runWorkspaceContextScope(done);
  });

  app.addHook("preHandler", async (request, reply) => {
    if (request.routeOptions.config.workspaceRequired !== true) {
      return;
    }

    const token = getBearerToken(request.headers.authorization);

    if (token === undefined) {
      await reply
        .status(401)
        .send(errorEnvelope("AUTH_REQUIRED", "A valid bearer token is required"));
      return;
    }

    try {
      const principal = await verifyAccessToken(token);
      const membership = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId: principal.workspaceId,
          userId: principal.userId,
          deletedAt: null
        },
        select: {
          role: true
        }
      });

      if (membership === null) {
        await reply.status(403).send(errorEnvelope("WORKSPACE_FORBIDDEN", "User is not a member of this workspace"));
        return;
      }

      const auth = {
        userId: principal.userId,
        workspaceId: principal.workspaceId,
        roles: [membership.role as Role]
      };

      request.auth = auth;
      setWorkspaceContext(auth);

      const permissions = request.routeOptions.config.permissions ?? [];

      if (permissions.length > 0 && !hasPermissions(auth.roles, permissions)) {
        await reply.status(403).send(
          errorEnvelope("RBAC_FORBIDDEN", "This role does not have permission to perform this action", [
            {
              requiredPermissions: permissions,
              roles: auth.roles
            }
          ])
        );
        return;
      }
    } catch {
      await reply.status(401).send(errorEnvelope("INVALID_TOKEN", "Bearer token is invalid or expired"));
    }
  });
}

function getBearerToken(authorization: string | undefined): string | undefined {
  if (authorization === undefined) {
    return undefined;
  }

  const [scheme, token] = authorization.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || token === undefined || token.length === 0) {
    return undefined;
  }

  return token;
}
