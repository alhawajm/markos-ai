import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

describe("in-app notification isolation", () => {
  it("separates recipients and workspaces and excludes email delivery records", async () => {
    const app = await buildApp();
    try {
      const register = async () =>
        (
          await app.inject({
            method: "POST",
            url: "/v1/auth/register",
            payload: {
              email: `notice-${randomUUID()}@markos.test`,
              password: "CorrectHorseBattery99!",
              fullName: "Notification Tester",
              workspaceName: `Notification ${randomUUID()}`,
              locale: "en"
            }
          })
        ).json().data;
      const a = await register();
      const b = await register();
      const own = await prisma.notification.create({
        data: {
          userId: a.user.id,
          workspaceId: a.workspace.id,
          channel: "IN_APP",
          templateKey: "publishing_failed",
          payload: { message: "Only owner A should see this" }
        }
      });
      const email = await prisma.notification.create({
        data: { userId: a.user.id, workspaceId: a.workspace.id, channel: "EMAIL", templateKey: "monthly_analytics_pdf", payload: {} }
      });
      await prisma.notification.create({
        data: { userId: b.user.id, workspaceId: a.workspace.id, channel: "IN_APP", templateKey: "publishing_failed", payload: {} }
      });
      await prisma.notification.create({
        data: { userId: a.user.id, workspaceId: b.workspace.id, channel: "IN_APP", templateKey: "publishing_failed", payload: {} }
      });
      const headers = (token: string) => ({ authorization: `Bearer ${token}` });
      const listA = await app.inject({ method: "GET", url: "/v1/notifications", headers: headers(a.tokens.accessToken) });
      expect(listA.statusCode).toBe(200);
      expect(listA.headers["cache-control"]).toBe("private, no-store");
      expect(listA.json().data.map((item: { id: string }) => item.id)).toEqual([own.id]);
      const listB = await app.inject({ method: "GET", url: "/v1/notifications", headers: headers(b.tokens.accessToken) });
      expect(listB.json().data).toEqual([]);
      expect((await app.inject({ method: "POST", url: `/v1/notifications/${own.id}/read`, headers: headers(b.tokens.accessToken) })).statusCode).toBe(404);
      expect((await app.inject({ method: "POST", url: `/v1/notifications/${email.id}/read`, headers: headers(a.tokens.accessToken) })).statusCode).toBe(404);
      expect(
        (await app.inject({ method: "POST", url: `/v1/notifications/${own.id}/read`, headers: headers(a.tokens.accessToken) })).json().data.readAt
      ).toBeTruthy();
    } finally {
      await app.close();
    }
  });
});
