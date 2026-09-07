import type { FastifyInstance } from "fastify";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { listNotifications, markNotificationRead, NotificationNotFoundError } from "./notification-service";

export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/notifications", { config: { workspaceRequired: true, permissions: ["workspace:read"] } }, async () => {
    const { userId, workspaceId } = requireWorkspaceContext();
    return ok(await listNotifications(userId, workspaceId));
  });

  app.post("/v1/notifications/:notificationId/read", { config: { workspaceRequired: true, permissions: ["workspace:read"] } }, async (request, reply) => {
    const params = request.params as { notificationId?: string };
    if (!params.notificationId) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Notification id is required"));
    const { userId, workspaceId } = requireWorkspaceContext();
    try {
      return ok(await markNotificationRead(userId, workspaceId, params.notificationId));
    } catch (error) {
      if (error instanceof NotificationNotFoundError) return reply.status(404).send(errorEnvelope("NOTIFICATION_NOT_FOUND", error.message));
      throw error;
    }
  });
}
