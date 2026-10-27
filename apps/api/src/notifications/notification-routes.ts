import type { FastifyInstance, FastifyContextConfig } from "fastify";
import { z } from "zod";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { listNotifications, markNotificationRead, notificationFeed, NotificationNotFoundError } from "./notification-service";
import { prisma } from "../db/prisma";
import { registerPushDevice } from "./push-service";

export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  const config: FastifyContextConfig = { workspaceRequired: true, verifiedUserRequired: true, permissions: ["workspace:read"] };
  app.get("/v1/notifications/preferences", { config }, async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const { workspaceId, userId } = requireWorkspaceContext();
    const preference = await prisma.notificationPreference.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    return ok({ pushPublishing: preference?.pushPublishing ?? false, monthlyReportEmail: preference?.monthlyReportEmail ?? false });
  });
  app.patch("/v1/notifications/preferences", { config }, async (request, reply) => {
    const parsed = z
      .object({ pushPublishing: z.boolean().optional(), monthlyReportEmail: z.boolean().optional() })
      .strict()
      .refine((v) => Object.keys(v).length > 0)
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Choose notification preferences"));
    const { workspaceId, userId } = requireWorkspaceContext();
    const changes = {
      ...(parsed.data.pushPublishing === undefined ? {} : { pushPublishing: parsed.data.pushPublishing }),
      ...(parsed.data.monthlyReportEmail === undefined ? {} : { monthlyReportEmail: parsed.data.monthlyReportEmail })
    };
    const preference = await prisma.notificationPreference.upsert({
      where: { workspaceId_userId: { workspaceId, userId } },
      create: { workspaceId, userId, ...changes },
      update: changes
    });
    return ok({ pushPublishing: preference.pushPublishing, monthlyReportEmail: preference.monthlyReportEmail });
  });
  app.post("/v1/notifications/devices", { config }, async (request, reply) => {
    const parsed = z
      .object({
        token: z.string().regex(/^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/),
        platform: z.enum(["android", "ios"]),
        locale: z.enum(["ar", "en"])
      })
      .strict()
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid notification device"));
    return ok(await registerPushDevice(requireWorkspaceContext().userId, parsed.data));
  });
  app.delete("/v1/notifications/devices/:id", { config }, async (request, reply) => {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!parsed.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid notification device"));
    await prisma.pushDevice.updateMany({ where: { id: parsed.data.id, userId: requireWorkspaceContext().userId }, data: { revokedAt: new Date() } });
    return ok({ revoked: true });
  });
  app.get("/v1/notifications/report-deliveries", { config }, async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const { workspaceId, userId } = requireWorkspaceContext();
    return ok(
      await prisma.analyticsReportDelivery.findMany({
        where: { workspaceId, userId },
        select: { id: true, month: true, status: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: "desc" },
        take: 12
      })
    );
  });
  app.get("/v1/notifications/feed", { config: { workspaceRequired: true, permissions: ["workspace:read"] } }, async (request, reply) => {
    const parsed = z
      .object({
        cursor: z.string().uuid().optional(),
        unreadOnly: z
          .enum(["true", "false"])
          .optional()
          .transform((value) => value === "true")
      })
      .strict()
      .safeParse(request.query);
    if (!parsed.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid notification query"));
    reply.header("Cache-Control", "private, no-store");
    const { userId, workspaceId } = requireWorkspaceContext();
    try {
      return ok(await notificationFeed(userId, workspaceId, parsed.data));
    } catch (error) {
      if (error instanceof NotificationNotFoundError)
        return reply.status(404).send(errorEnvelope("NOTIFICATION_NOT_FOUND", "Notification is no longer available"));
      throw error;
    }
  });
  app.get("/v1/notifications", { config: { workspaceRequired: true, permissions: ["workspace:read"] } }, async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store");
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
