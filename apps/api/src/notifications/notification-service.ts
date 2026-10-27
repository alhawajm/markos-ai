import type { Notification } from "@prisma/client";
import type { NotificationRecord, NotificationPage } from "@markos/shared-types";
import { prisma } from "../db/prisma";

export class NotificationNotFoundError extends Error {
  constructor() {
    super("Notification was not found");
  }
}

export async function listNotifications(userId: string, workspaceId: string): Promise<NotificationRecord[]> {
  const rows = await prisma.notification.findMany({
    where: { userId, workspaceId, channel: "IN_APP", deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 50
  });
  return rows.map(toNotificationRecord);
}

export async function notificationFeed(
  userId: string,
  workspaceId: string,
  input: { cursor?: string | undefined; unreadOnly?: boolean }
): Promise<NotificationPage> {
  const base = { userId, workspaceId, channel: "IN_APP", deletedAt: null };
  const cursor = input.cursor ? await prisma.notification.findFirst({ where: { ...base, id: input.cursor }, select: { id: true, createdAt: true } }) : null;
  if (input.cursor && !cursor) throw new NotificationNotFoundError();
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: {
        ...base,
        ...(input.unreadOnly ? { readAt: null } : {}),
        ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {})
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 21
    }),
    prisma.notification.count({ where: { ...base, readAt: null } })
  ]);
  return { items: rows.slice(0, 20).map(toNotificationRecord), unreadCount, ...(rows.length > 20 ? { nextCursor: rows[19]!.id } : {}) };
}

export async function markNotificationRead(userId: string, workspaceId: string, notificationId: string): Promise<NotificationRecord> {
  const notification = await prisma.notification.findFirst({ where: { id: notificationId, userId, workspaceId, channel: "IN_APP", deletedAt: null } });
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
