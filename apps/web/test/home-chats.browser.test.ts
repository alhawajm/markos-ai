import { chromium, type Browser } from "playwright-core";
import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdir } from "node:fs/promises";
import type { WorkspaceAssistantTurn, WorkspaceChatRecord } from "@markos/shared-types";
const base = process.env.SETTINGS_BROWSER_BASE_URL;
if (!base) throw new Error("SETTINGS_BROWSER_BASE_URL required");
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
  });
});
afterAll(async () => {
  await browser?.close();
});
it.each([
  { locale: "en", theme: "light", width: 1440 },
  { locale: "ar", theme: "dark", width: 390 }
] as const)(
  "separates tasks and opens persisted campaign previews ($locale)",
  async (v) => {
    const context = await browser.newContext({ viewport: { width: v.width, height: 900 } }),
      page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const oldId = "00000000-0000-4000-8000-000000000001",
      campaignId = "00000000-0000-4000-8000-000000000002";
    const now = new Date().toISOString();
    const chats: WorkspaceChatRecord[] = [{ id: oldId, title: "Earlier conversation", legacy: true, createdAt: now, updatedAt: now }];
    const histories = new Map<string, WorkspaceAssistantTurn[]>([
      [oldId, [{ id: "previous", message: "An earlier request", reply: "Earlier answer", status: "DISCUSSION", proposal: null, createdAt: now }]]
    ]);
    const session = {
      mfaVerified: true,
      tokens: { accessToken: "fixture", expiresIn: 900 },
      user: { id: "owner", email: "owner@pearl.test", fullName: "Owner", isVerified: true, locale: v.locale },
      workspace: { id: "workspace", name: "Pearl Bakery", slug: "pearl" },
      roles: ["OWNER"]
    };
    await page.addInitScript(
      ({ session, theme }) => {
        localStorage.setItem("markos.session", JSON.stringify(session));
        localStorage.setItem("markos.theme", theme);
      },
      { session, theme: v.theme }
    );
    const json = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
    await page.route("**/v1/**", async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname,
        method = route.request().method();
      if (method === "OPTIONS") return route.fulfill({ status: 204 });
      if (path === "/v1/auth/refresh") return route.fulfill(json(session));
      if (path === "/v1/onboarding")
        return route.fulfill(
          json({ status: "COMPLETE", businessProfile: { status: "APPROVED" }, modules: [], onboardingScore: 100, vaultScore: { score: 100 } })
        );
      if (path === "/v1/assistant/chats") return route.fulfill(json({ items: chats, nextCursor: null }));
      const messages = path.match(/^\/v1\/assistant\/chats\/([^/]+)\/messages$/);
      if (messages) return route.fulfill(json({ turns: histories.get(messages[1]!) ?? [], nextBefore: null }));
      if (path.startsWith("/v1/assistant/chats/") && method === "PATCH") {
        const chat = chats.find((c) => c.id === path.split("/").at(-1))!;
        chat.title = route.request().postDataJSON().title;
        return route.fulfill(json(chat));
      }
      if (path === "/v1/assistant/conversation" && method === "POST") {
        const body = route.request().postDataJSON(),
          id = body.chatId;
        const turn: WorkspaceAssistantTurn = {
          id: body.requestId,
          chatId: id,
          message: body.message,
          reply:
            body.message === "I want to create a campaign"
              ? v.locale === "ar"
                ? "ماذا تريد الترويج له، وما هدفك؟"
                : "What are you promoting, and what is the goal?"
              : "A 7-day launch campaign, one post per day.",
          status: body.message === "I want to create a campaign" ? "DISCUSSION" : "PROPOSED",
          proposal: null,
          createdAt: now,
          ...(body.message !== "I want to create a campaign"
            ? {
                confirmationToken: campaignId,
                proposal: {
                  action: "CAMPAIGN" as const,
                  summary: "Pearl launch: 7 days, one post per day.",
                  instruction: body.message,
                  contentType: null,
                  contentItemId: null,
                  durationDays: 7,
                  startsAt: "2026-12-01T06:00:00Z",
                  publishesPerDay: 1
                }
              }
            : {})
        };
        histories.set(id, [...(histories.get(id) ?? []), turn]);
        if (!chats.some((c) => c.id === id)) chats.unshift({ id, title: body.message, legacy: false, createdAt: now, updatedAt: now });
        return route.fulfill(json(turn));
      }
      if (path.endsWith("/confirm")) {
        const id = path.split("/").at(-2),
          turn = [...histories.values()].flat().find((t) => t.id === id)!;
        Object.assign(turn, {
          status: "COMPLETED",
          reply: "Your campaign is ready.",
          campaignId,
          result: {
            kind: "CAMPAIGN",
            id: campaignId,
            title: "Pearl launch",
            summary: "A bilingual launch plan",
            durationDays: 7,
            publishesPerDay: 1,
            postCount: 7,
            startsAt: "2026-12-01T06:00:00Z",
            endsAt: "2026-12-07T06:00:00Z"
          }
        });
        return route.fulfill(json(turn));
      }
      if (path === "/v1/assistant/memory" || path === "/v1/notifications") return route.fulfill(json([]));
      if (path === "/v1/campaigns/summaries") return route.fulfill(json({ items: [], nextCursor: null }));
      return route.fulfill(json(null));
    });
    try {
      await page.goto(`${base}/${v.locale}/app`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.getByText("Earlier answer", { exact: true }).waitFor();
      await page.locator("#home-message").fill("Unsent earlier follow-up");
      await page.getByRole("button", { name: v.locale === "ar" ? "محادثة جديدة" : "New chat", exact: true }).click();
      expect(await page.locator("#home-message").inputValue()).toBe("");
      expect(await page.getByText("Earlier answer", { exact: true }).count()).toBe(0);
      await page.locator("#home-message").fill("I want to create a campaign");
      await page.locator(".workspace-chat-composer [type=submit]").click();
      await page.getByText(v.locale === "ar" ? "ماذا تريد الترويج له، وما هدفك؟" : "What are you promoting, and what is the goal?", { exact: true }).waitFor();
      expect(await page.locator(".workspace-chat-plan").count()).toBe(0);
      await page.locator("#home-message").fill("Launch our bakery, 7 days, one post per day from December 1");
      await page.locator(".workspace-chat-composer [type=submit]").click();
      await page.locator(".workspace-chat-plan button").click();
      const card = page.locator(".workspace-artifact-card");
      await card.waitFor();
      expect(await card.innerText()).toContain("Pearl launch");
      expect(await card.locator("strong").allTextContents()).toEqual(await page.evaluate((locale) => [7, 7, 1].map((n) => n.toLocaleString(locale)), v.locale));
      expect(await card.getAttribute("href")).toBe(`/${v.locale}/app/campaigns?campaign=${campaignId}`);
      const toolbar = await page.locator(".workspace-chat-toolbar").boundingBox();
      expect(toolbar!.y).toBeGreaterThanOrEqual(0);
      expect(toolbar!.y).toBeLessThan(180);
      await mkdir("../../var/home-chats-2026-11-16/screens", { recursive: true });
      await page.screenshot({ path: `../../var/home-chats-2026-11-16/screens/home-${v.locale}.png` });
      await page.getByRole("button", { name: v.locale === "ar" ? "المحادثات" : "Chats", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: /Earlier conversation|المحادثة السابقة/ }).click();
      await expect.poll(() => page.locator("#home-message").inputValue()).toBe("Unsent earlier follow-up");
      await page.getByText("Earlier answer", { exact: true }).waitFor();
      await page.getByRole("button", { name: v.locale === "ar" ? "المحادثات" : "Chats", exact: true }).click();
      await dialog.getByRole("button", { name: "I want to create a campaign", exact: false }).click();
      await card.waitFor();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await card.click();
      await page.waitForURL(`**/${v.locale}/app/campaigns?campaign=${campaignId}`);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  },
  90000
);
