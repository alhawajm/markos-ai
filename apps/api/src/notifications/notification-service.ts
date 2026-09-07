import type { Notification } from "@prisma/client";
import type { NotificationRecord } from "@markos/shared-types";
import { prisma } from "../db/prisma";

export class NotificationNotFoundError extends Error {
  constructor() {
    super("Notification was not found");
  }
}

export async function listNotifications(userId: string, workspaceId: string): Promise<NotificationRecord[]> {
  const rows = await prisma.notification.findMany({
    where: { userId, workspaceId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 50
  });
  return rows.map(toNotificationRecord);
}

export async function markNotificationRead(userId: string, workspaceId: string, notificationId: string): Promise<NotificationRecord> {
  const notification = await prisma.notification.findFirst({ where: { id: notificationId, userId, workspaceId, deletedAt: null } });
  if (!notification) throw new NotificationNotFoundError();
  return toNotificationRecord(
    await prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: notification.readAt ?? new Date() }
    })
  );
}

function toNotificationRecord(row: Notification): NotificationRecord {
  const payload = typeof row.payload === "object" && row.payload !== null && !Array.isArray(row.payload) ? (row.payload as Record<string, unknown>) : {};
  return {
    id: row.id,
    userId: row.userId,
    ...(row.workspaceId ? { workspaceId: row.workspaceId } : {}),
    channel: row.channel,
    templateKey: row.templateKey,
    payload,
    ...(row.readAt ? { readAt: row.readAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
