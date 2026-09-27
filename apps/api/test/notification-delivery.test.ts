import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { env } from "../src/config/env";
import { buildApp } from "../src/http/app";
import { notifyPublication, processPushDeliveries, registerPushDevice } from "../src/notifications/push-service";
import { processReportDeliveries, sendMonthlyAnalyticsPdfEmail, ReportMailError } from "../src/analytics/analytics-email-service";
vi.mock("../src/analytics/analytics-service", async (original) => ({
  ...(await original<object>()),
  exportMonthlyAnalyticsPdf: vi.fn(async (workspaceId: string) => ({ bytes: Buffer.from(`%PDF-${workspaceId}`), filename: "report.pdf" }))
}));
if (!new URL(env.DATABASE_URL).pathname.endsWith("markos_production_features_test"))
  throw new Error("Use the disposable markos_production_features_test database");
async function fixture() {
  const user = await prisma.user.create({ data: { email: `${randomUUID()}@markos.test`, fullName: "Notice owner", isVerified: true } });
  const workspace = await prisma.workspace.create({ data: { ownerUserId: user.id, name: "Notice test", slug: randomUUID() } });
  await prisma.workspaceMember.create({ data: { userId: user.id, workspaceId: workspace.id, role: "OWNER" } });
  return { user, workspace };
}
describe("opt-in, isolated delivery", () => {
  it("never sends by default, scopes devices to the recipient, cancels after opt-out and disables unregistered devices", async () => {
    const { user, workspace } = await fixture();
    const device = await registerPushDevice(user.id, { token: `ExpoPushToken[${randomUUID()}]`, platform: "android", locale: "en" });
    const notify = () => prisma.$transaction((tx) => notifyPublication(tx, workspace.id, "publishing_failed", { contentItemId: randomUUID() }));
    await notify();
    expect(await prisma.pushDelivery.count({ where: { workspaceId: workspace.id } })).toBe(0);
    await prisma.notificationPreference.create({ data: { workspaceId: workspace.id, userId: user.id, pushPublishing: true } });
    await notify();
    await prisma.notificationPreference.updateMany({ where: { workspaceId: workspace.id }, data: { pushPublishing: false } });
    const fetcher = vi.fn<typeof fetch>();
    await processPushDeliveries(fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await prisma.pushDelivery.findFirstOrThrow({ where: { workspaceId: workspace.id } })).status).toBe("CANCELLED");
    await prisma.notificationPreference.updateMany({ where: { workspaceId: workspace.id }, data: { pushPublishing: true } });
    await notify();
    fetcher.mockResolvedValue(new Response(JSON.stringify({ data: { status: "error", details: { error: "DeviceNotRegistered" } } })));
    await processPushDeliveries(fetcher);
    expect((await prisma.pushDevice.findUniqueOrThrow({ where: { id: device.id } })).revokedAt).not.toBeNull();
  });
  it("checks receipts and never replays ambiguous sends or tokens reassigned to another account", async () => {
    const a = await fixture(),
      b = await fixture(),
      token = `ExpoPushToken[${randomUUID()}]`;
    await registerPushDevice(a.user.id, { token, platform: "ios", locale: "ar" });
    await prisma.notificationPreference.create({ data: { workspaceId: a.workspace.id, userId: a.user.id, pushPublishing: true } });
    const notify = () => prisma.$transaction((tx) => notifyPublication(tx, a.workspace.id, "publishing_succeeded", {}));
    await notify();
    const now = new Date();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ data: { status: "ok", id: "receipt-a" } })));
    await processPushDeliveries(fetcher, now);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).body).toBe("تم نشر المحتوى على إنستغرام.");
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ data: { "receipt-a": { status: "ok" } } })));
    await processPushDeliveries(fetcher, new Date(now.getTime() + 16 * 60_000));
    expect((await prisma.pushDelivery.findFirstOrThrow({ where: { workspaceId: a.workspace.id } })).status).toBe("PROVIDER_ACCEPTED");
    await notify();
    fetcher.mockRejectedValueOnce(new Error("timeout"));
    await processPushDeliveries(fetcher);
    const calls = fetcher.mock.calls.length;
    await processPushDeliveries(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(calls);
    await notify();
    await registerPushDevice(b.user.id, { token, platform: "ios", locale: "en" });
    await processPushDeliveries(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(calls);
  });
  it("queues one report per user/workspace/month; accepted and unknown results are never retried", async () => {
    const a = await fixture(),
      b = await fixture();
    expect((await sendMonthlyAnalyticsPdfEmail(a.workspace.id)).skippedReason).toBe("NOT_SUBSCRIBED");
    await expect(sendMonthlyAnalyticsPdfEmail(a.workspace.id, { actorId: b.user.id })).rejects.toThrow("REPORT_RECIPIENT_NOT_A_MEMBER");
    await Promise.all([1, 2].map(() => sendMonthlyAnalyticsPdfEmail(a.workspace.id, { actorId: a.user.id, month: "2026-08" })));
    const send = vi.fn(async () => ({ messageId: "sendgrid-id" }));
    await processReportDeliveries({ workspaceIds: [a.workspace.id], provider: { mode: "sendgrid", send } });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual([expect.objectContaining({ to: [a.user.email], attachment: Buffer.from(`%PDF-${a.workspace.id}`) })]);
    expect((await prisma.analyticsReportDelivery.findFirstOrThrow({ where: { workspaceId: a.workspace.id } })).status).toBe("ACCEPTED");
    await processReportDeliveries({ workspaceIds: [a.workspace.id], provider: { mode: "sendgrid", send } });
    expect(send).toHaveBeenCalledTimes(1);
    await sendMonthlyAnalyticsPdfEmail(a.workspace.id, { actorId: a.user.id, month: "2026-07" });
    const uncertain = vi.fn(async () => {
      throw new ReportMailError("REPORT_EMAIL_RESULT_UNKNOWN", "UNKNOWN");
    });
    await processReportDeliveries({ workspaceIds: [a.workspace.id], provider: { mode: "sendgrid", send: uncertain } });
    await processReportDeliveries({ workspaceIds: [a.workspace.id], provider: { mode: "sendgrid", send: uncertain } });
    expect(uncertain).toHaveBeenCalledTimes(1);
  });
  it("keeps preferences, report history and device revocation scoped across users and workspaces", async () => {
    const app = await buildApp();
    try {
      const register = async () => {
        const response = await app.inject({
          method: "POST",
          url: "/v1/auth/register",
          payload: {
            email: `${randomUUID()}@markos.test`,
            password: "CorrectHorseBattery99!",
            fullName: "Scoped owner",
            workspaceName: "Scoped workspace",
            locale: "en"
          }
        });
        const data = response.json().data;
        await prisma.user.update({ where: { id: data.user.id }, data: { isVerified: true } });
        return data;
      };
      const a = await register(),
        b = await register();
      const headers = (s: typeof a) => ({ authorization: `Bearer ${s.tokens.accessToken}` });
      expect(
        (await app.inject({ method: "PATCH", url: "/v1/notifications/preferences", headers: headers(a), payload: { monthlyReportEmail: true } })).statusCode
      ).toBe(200);
      expect((await app.inject({ url: "/v1/notifications/preferences", headers: headers(b) })).json().data.monthlyReportEmail).toBe(false);
      await prisma.analyticsReportDelivery.create({ data: { workspaceId: a.workspace.id, userId: a.user.id, month: "2026-08" } });
      expect((await app.inject({ url: "/v1/notifications/report-deliveries", headers: headers(b) })).json().data).toEqual([]);
      const device = await registerPushDevice(a.user.id, { token: `ExpoPushToken[${randomUUID()}]`, platform: "android", locale: "en" });
      await app.inject({ method: "DELETE", url: `/v1/notifications/devices/${device.id}`, headers: headers(b) });
      expect((await prisma.pushDevice.findUniqueOrThrow({ where: { id: device.id } })).revokedAt).toBeNull();
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: "/v1/notifications/preferences",
            headers: headers(b),
            payload: { workspaceId: a.workspace.id, pushPublishing: true }
          })
        ).statusCode
      ).toBe(400);
    } finally {
      await app.close();
    }
  });
});
