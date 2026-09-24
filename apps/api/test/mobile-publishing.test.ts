import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { env } from "../src/config/env";
import { register } from "../src/auth/auth-service";
import { registerWorkspaceContext } from "../src/tenancy/workspace-plugin";
import { registerPublishingRoutes } from "../src/publishing/publishing-routes";
import { registerNotificationRoutes } from "../src/notifications/notification-routes";
import { readWorkspaceCalendar } from "../src/calendar/calendar-service";
if (env.NODE_ENV !== "test" || new URL(env.DATABASE_URL).pathname !== "/markos_mobile_publishing_test")
  throw Error("Use only the disposable markos_mobile_publishing_test database");
const app = Fastify({ logger: false });
beforeAll(async () => {
  await registerWorkspaceContext(app);
  await registerPublishingRoutes(app);
  await registerNotificationRoutes(app);
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
async function owner() {
  return (
    await register({ email: `mobile-publish-${randomUUID()}@example.test`, password: "Unique test passphrase 99!", fullName: "Publishing Owner", locale: "en" })
  ).session;
}
const headers = (token: string) => ({ authorization: `Bearer ${token}` });
describe("mobile publishing activity and notification isolation", () => {
  it("paginates only this workspace's activity, attaches its latest job and enforces auth/filter bounds", async () => {
    const a = await owner();
    const b = await owner();
    await Promise.all(
      Array.from({ length: 23 }, (_, i) =>
        prisma.contentItem.create({
          data: {
            workspaceId: a.workspace.id,
            contentType: "POST",
            status: "SCHEDULED",
            scheduledAt: new Date("2050-01-01"),
            caption: `Scheduled ${i}`,
            mediaItems: { create: { position: 0, mediaKind: "IMAGE" } }
          }
        })
      )
    );
    const foreign = await prisma.contentItem.create({
      data: { workspaceId: b.workspace.id, contentType: "POST", status: "FAILED", mediaItems: { create: { position: 0, mediaKind: "IMAGE" } } }
    });
    const item = await prisma.contentItem.create({
      data: {
        workspaceId: a.workspace.id,
        contentType: "POST",
        status: "FAILED",
        caption: "Requires review",
        mediaItems: { create: { position: 0, mediaKind: "IMAGE" } }
      }
    });
    for (const status of ["FAILED", "CANCELLED"] as const)
      await prisma.publishJob.create({
        data: {
          workspaceId: a.workspace.id,
          contentItemId: item.id,
          status,
          trigger: "SCHEDULED",
          scheduledFor: new Date("2050-01-01"),
          idempotencyKey: randomUUID()
        }
      });
    const first = await app.inject({ url: "/v1/publishing/activity", headers: headers(a.tokens.accessToken) });
    expect(first.statusCode).toBe(200);
    expect(first.headers["cache-control"]).toBe("private, no-store");
    const page = first.json().data;
    expect(page.items).toHaveLength(20);
    expect(page.total).toBe(24);
    expect(page.nextOffset).toBe(20);
    expect(page.items.every((row: { content: { workspaceId: string } }) => row.content.workspaceId === a.workspace.id)).toBe(true);
    const last = (await app.inject({ url: "/v1/publishing/activity?offset=20", headers: headers(a.tokens.accessToken) })).json().data;
    expect(last.items).toHaveLength(4);
    expect(last.nextOffset).toBeUndefined();
    const filtered = (await app.inject({ url: "/v1/publishing/activity?status=FAILED", headers: headers(a.tokens.accessToken) })).json().data;
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0].content.id).toBe(item.id);
    expect(filtered.items[0].job.status).toBe("CANCELLED");
    expect((await app.inject({ url: "/v1/publishing/activity?offset=-1", headers: headers(a.tokens.accessToken) })).statusCode).toBe(400);
    expect((await app.inject({ url: "/v1/publishing/activity" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/v1/publishing/activity", headers: headers(b.tokens.accessToken) })).json().data.items[0].content.id).toBe(foreign.id);
  });
  it("uses recipient/workspace-bound cursors and accurate unread counts without email records", async () => {
    const a = await owner();
    const b = await owner();
    const stamp = new Date("2026-09-24");
    await prisma.notification.createMany({
      data: Array.from({ length: 25 }, () => ({
        userId: a.user.id,
        workspaceId: a.workspace.id,
        channel: "IN_APP",
        templateKey: "publishing_succeeded",
        payload: {},
        createdAt: stamp
      }))
    });
    const foreign = await prisma.notification.create({
      data: { userId: b.user.id, workspaceId: a.workspace.id, channel: "IN_APP", templateKey: "publishing_failed", payload: {} }
    });
    const otherWorkspace = await prisma.notification.create({
      data: { userId: a.user.id, workspaceId: b.workspace.id, channel: "IN_APP", templateKey: "publishing_failed", payload: {} }
    });
    await prisma.notification.create({ data: { userId: a.user.id, workspaceId: a.workspace.id, channel: "EMAIL", templateKey: "email", payload: {} } });
    const first = (await app.inject({ url: "/v1/notifications/feed", headers: headers(a.tokens.accessToken) })).json().data;
    expect(first.items).toHaveLength(20);
    expect(first.unreadCount).toBe(25);
    const last = (await app.inject({ url: `/v1/notifications/feed?cursor=${first.nextCursor}`, headers: headers(a.tokens.accessToken) })).json().data;
    expect(last.items).toHaveLength(5);
    expect(last.nextCursor).toBeUndefined();
    expect(new Set([...first.items, ...last.items].map((row) => row.id)).size).toBe(25);
    for (const id of [foreign.id, otherWorkspace.id])
      expect((await app.inject({ url: `/v1/notifications/feed?cursor=${id}`, headers: headers(a.tokens.accessToken) })).statusCode).toBe(404);
    const read = await app.inject({ method: "POST", url: `/v1/notifications/${first.items[0].id}/read`, headers: headers(a.tokens.accessToken) });
    expect(read.statusCode).toBe(200);
    const unread = (await app.inject({ url: "/v1/notifications/feed?unreadOnly=true", headers: headers(a.tokens.accessToken) })).json().data;
    expect(unread.unreadCount).toBe(24);
    expect(unread.items.every((row: { readAt?: string }) => !row.readAt)).toBe(true);
    expect((await app.inject({ url: "/v1/notifications/feed?unreadOnly=anything", headers: headers(a.tokens.accessToken) })).statusCode).toBe(400);
  });
  it("calendar keeps planned drafts and reads an inclusive seven-day Bahrain range", async () => {
    const a = await owner();
    const b = await owner();
    const planned = await prisma.contentItem.create({
      data: {
        workspaceId: a.workspace.id,
        contentType: "POST",
        status: "DRAFT",
        plannedAt: new Date("2026-09-20T00:00:00+03:00"),
        mediaItems: { create: { position: 0, mediaKind: "IMAGE" } }
      }
    });
    const published = await prisma.contentItem.create({
      data: {
        workspaceId: a.workspace.id,
        contentType: "POST",
        status: "PUBLISHED",
        publishedAt: new Date("2026-09-26T23:59:00+03:00"),
        mediaItems: { create: { position: 0, mediaKind: "IMAGE" } }
      }
    });
    await prisma.contentItem.create({
      data: {
        workspaceId: a.workspace.id,
        contentType: "POST",
        status: "PUBLISHED",
        publishedAt: new Date("2026-09-27T00:00:00+03:00"),
        mediaItems: { create: { position: 0, mediaKind: "IMAGE" } }
      }
    });
    await prisma.contentItem.create({
      data: {
        workspaceId: b.workspace.id,
        contentType: "POST",
        status: "DRAFT",
        plannedAt: new Date("2026-09-21T00:00:00+03:00"),
        mediaItems: { create: { position: 0, mediaKind: "IMAGE" } }
      }
    });
    const result = await readWorkspaceCalendar(a.workspace.id, { from: "2026-09-20", to: "2026-09-26", unscheduledOffset: 0, unscheduledLimit: 20 });
    expect(result.items.map((row) => row.id).sort()).toEqual([planned.id, published.id].sort());
  });
});
