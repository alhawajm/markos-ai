import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { encryptCredential, decryptCredential } from "../security/credential-encryption";

const encryptionKey = () => createHash("sha256").update(`markos-push-v1:${env.JWT_REFRESH_SECRET}`).digest("base64");
export async function registerPushDevice(userId: string, input: { token: string; platform: string; locale: "ar" | "en" }) {
  const tokenHash = createHash("sha256").update(input.token).digest("hex");
  const data = {
    userId,
    tokenCiphertext: encryptCredential(input.token, encryptionKey()),
    platform: input.platform,
    locale: input.locale === "ar" ? ("AR" as const) : ("EN" as const),
    revokedAt: null
  };
  const device = await prisma.pushDevice.upsert({ where: { tokenHash }, create: { id: randomUUID(), tokenHash, ...data }, update: data });
  return { id: device.id };
}

/** Create in-app events and their push outbox atomically with the publication result. */
export async function notifyPublication(tx: Prisma.TransactionClient, workspaceId: string, templateKey: string, payload: Prisma.InputJsonObject) {
  const workspace = await tx.workspace.findFirst({ where: { id: workspaceId, deletedAt: null } });
  if (!workspace) return;
  const members = await tx.workspaceMember.findMany({ where: { workspaceId, deletedAt: null }, select: { userId: true } });
  for (const userId of new Set([workspace.ownerUserId, ...members.map((m) => m.userId)])) {
    const notification = await tx.notification.create({ data: { userId, workspaceId, channel: "IN_APP", templateKey, payload } });
    const preference = await tx.notificationPreference.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!preference?.pushPublishing) continue;
    const devices = await tx.pushDevice.findMany({ where: { userId, revokedAt: null, updatedAt: { gt: new Date(Date.now() - 30 * 86400_000) } } });
    if (devices.length)
      await tx.pushDelivery.createMany({ data: devices.map((device) => ({ workspaceId, userId, notificationId: notification.id, deviceId: device.id })) });
  }
}

type Ticket = { status?: string; id?: string; details?: { error?: string } };
const failureCode = (ticket: Ticket) =>
  ["DeviceNotRegistered", "MessageTooBig", "MessageRateExceeded", "MismatchSenderId", "InvalidCredentials"].includes(ticket.details?.error ?? "")
    ? ticket.details!.error!
    : "PUSH_REJECTED";
async function requestExpo(path: "send" | "getReceipts", body: unknown, fetchImpl: typeof fetch) {
  return fetchImpl(`https://exp.host/--/api/v2/push/${path}`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { "content-type": "application/json", ...(env.EXPO_PUSH_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_PUSH_ACCESS_TOKEN}` } : {}) },
    body: JSON.stringify(body)
  });
}
export async function processPushDeliveries(fetchImpl: typeof fetch = fetch, now = new Date()) {
  // A crashed sender may have reached Expo. Preserve uncertainty instead of duplicating an alert.
  await prisma.pushDelivery.updateMany({
    where: { status: "PROCESSING", leaseUntil: { lt: now } },
    data: { status: "UNKNOWN", failureCode: "PUSH_RESULT_UNKNOWN", leaseUntil: null }
  });
  let accepted = 0,
    failed = 0;
  const candidates = await prisma.pushDelivery.findMany({ where: { status: "PENDING", availableAt: { lte: now } }, orderBy: { createdAt: "asc" }, take: 20 });
  for (const job of candidates) {
    const claimed = await prisma.pushDelivery.updateMany({
      where: { id: job.id, status: "PENDING", attempts: job.attempts },
      data: { status: "PROCESSING", attempts: { increment: 1 }, leaseUntil: new Date(now.getTime() + 60_000) }
    });
    if (!claimed.count) continue;
    const [device, preference, membership, workspace, user, notification] = await Promise.all([
      prisma.pushDevice.findFirst({ where: { id: job.deviceId, userId: job.userId, revokedAt: null } }),
      prisma.notificationPreference.findUnique({ where: { workspaceId_userId: { workspaceId: job.workspaceId, userId: job.userId } } }),
      prisma.workspaceMember.findFirst({ where: { workspaceId: job.workspaceId, userId: job.userId, deletedAt: null } }),
      prisma.workspace.findFirst({ where: { id: job.workspaceId, deletedAt: null } }),
      prisma.user.findFirst({ where: { id: job.userId, deletedAt: null, isVerified: true } }),
      prisma.notification.findFirst({ where: { id: job.notificationId, workspaceId: job.workspaceId, userId: job.userId, deletedAt: null } })
    ]);
    if (!device || !preference?.pushPublishing || !membership || !workspace || !user || !notification || now.getTime() - job.createdAt.getTime() > 86400_000) {
      await prisma.pushDelivery.update({ where: { id: job.id }, data: { status: "CANCELLED", leaseUntil: null } });
      continue;
    }
    let state: { status: string; failureCode?: string; ticketId?: string; availableAt?: Date };
    try {
      const ar = device.locale === "AR",
        success = notification.templateKey === "publishing_succeeded";
      const response = await requestExpo(
        "send",
        {
          to: decryptCredential(device.tokenCiphertext, encryptionKey()),
          title: "MARKOS",
          body: success
            ? ar
              ? "تم نشر المحتوى على إنستغرام."
              : "Your content was published on Instagram."
            : ar
              ? "يحتاج النشر إلى انتباهك. افتح ماركوس للاطلاع على التفاصيل."
              : "Publishing needs your attention. Open MARKOS for details.",
          sound: "default",
          channelId: "publishing",
          ttl: 86400,
          data: { notificationId: job.notificationId, workspaceId: job.workspaceId, userId: job.userId }
        },
        fetchImpl
      );
      if (response.status === 429 || response.status >= 500) {
        state = {
          status: job.attempts < 4 ? "PENDING" : "FAILED",
          failureCode: "PUSH_TEMPORARILY_UNAVAILABLE",
          availableAt: new Date(now.getTime() + 30_000 * 2 ** job.attempts)
        };
      } else if (!response.ok) state = { status: "FAILED", failureCode: "PUSH_CONFIGURATION_ERROR" };
      else {
        const { data } = (await response.json()) as { data?: Ticket };
        if (data?.status === "ok" && data.id) state = { status: "ACCEPTED", ticketId: data.id, availableAt: new Date(now.getTime() + 15 * 60_000) };
        else if (data?.status === "error") {
          const code = failureCode(data);
          state = {
            status: code === "MessageRateExceeded" && job.attempts < 4 ? "PENDING" : "FAILED",
            failureCode: code,
            availableAt: new Date(now.getTime() + 60_000 * 2 ** job.attempts)
          };
          if (code === "DeviceNotRegistered")
            await prisma.pushDevice.updateMany({
              where: { id: device.id, tokenHash: device.tokenHash, updatedAt: device.updatedAt },
              data: { revokedAt: now }
            });
        } else state = { status: "UNKNOWN", failureCode: "PUSH_RESULT_UNKNOWN" };
      }
    } catch {
      state = { status: "UNKNOWN", failureCode: "PUSH_RESULT_UNKNOWN" };
    }
    await prisma.pushDelivery.updateMany({ where: { id: job.id, status: "PROCESSING" }, data: { ...state, leaseUntil: null } });
    if (state.status === "ACCEPTED") accepted++;
    else if (["FAILED", "UNKNOWN"].includes(state.status)) failed++;
  }
  const receipts = await prisma.pushDelivery.findMany({ where: { status: "ACCEPTED", availableAt: { lte: now }, ticketId: { not: null } }, take: 100 });
  if (receipts.length) {
    const response = await requestExpo("getReceipts", { ids: receipts.map((r) => r.ticketId) }, fetchImpl);
    if (!response.ok) throw new Error("PUSH_RECEIPTS_UNAVAILABLE");
    const result = (await response.json()) as { data?: Record<string, Ticket> };
    for (const job of receipts) {
      const ticket = result.data?.[job.ticketId!];
      const code = ticket?.status === "error" ? failureCode(ticket) : null;
      const status =
        ticket?.status === "ok" ? "PROVIDER_ACCEPTED" : code ? "FAILED" : now.getTime() - job.createdAt.getTime() > 23 * 3600_000 ? "UNKNOWN" : "ACCEPTED";
      await prisma.pushDelivery.updateMany({
        where: { id: job.id, status: "ACCEPTED" },
        data: { status, failureCode: code, availableAt: new Date(now.getTime() + 15 * 60_000) }
      });
      if (code === "DeviceNotRegistered")
        await prisma.pushDevice.updateMany({ where: { id: job.deviceId, userId: job.userId, updatedAt: { lte: job.createdAt } }, data: { revokedAt: now } });
    }
  }
  await prisma.pushDelivery.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 30 * 86400_000) }, status: { notIn: ["PENDING", "PROCESSING", "ACCEPTED"] } }
  });
  return { accepted, failed };
}
