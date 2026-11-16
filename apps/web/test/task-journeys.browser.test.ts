import { chromium, type Browser } from "playwright-core";
import { beforeAll, afterAll, it, expect } from "vitest";
import { mkdir } from "node:fs/promises";
import { draft } from "./create-fixtures";
const base = process.env.SETTINGS_BROWSER_BASE_URL;
if (!base) throw Error("SETTINGS_BROWSER_BASE_URL required");
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {})
  });
  await mkdir("../../var/ux-correction-2026-11-15/screens", { recursive: true });
});
afterAll(async () => {
  await browser?.close();
});
it.each([
  { route: "content-studio", locale: "en", width: 1440, theme: "light" },
  { route: "content-studio", locale: "ar", width: 390, theme: "dark" },
  { route: "campaigns", locale: "en", width: 1440, theme: "dark" },
  { route: "campaigns", locale: "ar", width: 390, theme: "light" },
  { route: "strategy", locale: "en", width: 1440, theme: "light" },
  { route: "strategy", locale: "ar", width: 390, theme: "dark" }
] as const)(
  "focused tools, no duplicate chat: $route $locale $theme",
  async (v) => {
    const context = await browser.newContext({
      viewport: { width: v.width, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: v.theme,
      reducedMotion: "reduce"
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const session = {
      user: { id: "tool-owner", fullName: "Tool Owner", email: "owner@example.test", isVerified: true, locale: v.locale },
      workspace: { id: "tool-workspace", name: "Fictional bakery" },
      tokens: { accessToken: "tool-fixture", expiresIn: 900 },
      roles: ["OWNER"],
      mfaVerified: true
    };
    const item = draft({ id: "22222222-2222-4222-8222-222222222222", brief: "Existing pastry draft" });
    let conversations = 0,
      creations = 0,
      campaignRequests = 0;
    await page.addInitScript((value) => localStorage.setItem("markos.session", JSON.stringify(value)), {
      user: session.user,
      workspace: session.workspace,
      roles: session.roles
    });
    await page.route("**/v1/**", async (route) => {
      const url = new URL(route.request().url()),
        method = route.request().method();
      let data: unknown = [];
      if (method === "OPTIONS") return route.fulfill({ status: 204 });
      if (url.pathname === "/v1/auth/refresh") data = session;
      else if (url.pathname === "/v1/onboarding") data = { status: "COMPLETE", businessProfile: { status: "APPROVED" } };
      else if (url.pathname === "/v1/vault/score") data = { entryCount: 4, score: 60, missingSections: [] };
      else if (url.pathname === "/v1/campaigns/summaries")
        data = {
          items: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              title: "Bakery launch",
              objective: "Attract local customers",
              startsAt: "2026-11-15T00:00:00Z",
              endsAt: "2026-11-28T23:59:59Z",
              durationDays: 14,
              publishesPerDay: 1,
              postCounts: { total: 14, idea: 14, draft: 0, inReview: 0, ready: 0, scheduled: 0, published: 0, failed: 0 },
              status: "DRAFT"
            }
          ],
          nextCursor: null
        };
      else if (url.pathname === "/v1/content") {
        if (method === "POST") {
          creations++;
          expect(route.request().postDataJSON()).toMatchObject({ contentType: "POST" });
          data = item;
        } else data = [item];
      } else if (url.pathname === `/v1/content/${item.id}`) data = item;
      else if (url.pathname === `/v1/content/${item.id}/conversation`) data = { id: null, contentItem: item, messages: [], latestRun: null };
      else if (url.pathname.endsWith("/latest")) data = null;
      else if (url.pathname === "/v1/assistant/conversation") {
        conversations++;
        data = [];
      } else if (url.pathname === "/v1/assistant/chats") {
        data = { items: [], nextCursor: null };
      } else if (url.pathname === "/v1/assistant/strategy")
        data = {
          id: "saved-strategy",
          createdAt: "2026-11-14T12:00:00Z",
          strategy: {
            summary: "A clear bakery direction",
            strategy: { objectives: ["Attract local customers"], pillars: ["Fresh morning rituals"], nextActions: ["Prepare next week’s content"] },
            sources: ["COMPANY/private-source-id"],
            assumptions: [],
            missingInformation: []
          }
        };
      else if (url.pathname === "/v1/campaigns/generations" && method === "POST") {
        campaignRequests++;
        const input = route.request().postDataJSON();
        expect(input.objective).toBe("A winter bakery launch");
        expect(input.durationDays).toBe(14);
        expect(input.referenceFiles).toHaveLength(1);
        data = {
          id: "job-fixture",
          requestId: input.requestId,
          objective: input.objective,
          status: "QUEUED",
          campaignId: null,
          canResume: false,
          progress: { completedWeeks: 0, totalWeeks: 2 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
    });
    try {
      await page.goto(`${base}/${v.locale}/app/${v.route}`, { waitUntil: "domcontentloaded" });
      if (v.route === "content-studio") {
        await page.getByRole("heading", { name: "Existing pastry draft", exact: true }).waitFor();
        expect(creations).toBe(0);
        expect(conversations).toBe(0);
        expect(await page.getByLabel(v.locale === "ar" ? "راسل ماركوس" : "Message MARKOS", { exact: true }).count()).toBe(0);
        await page.screenshot({ path: `../../var/ux-correction-2026-11-15/screens/${v.route}-${v.locale}-start.png` });
        await page.getByRole("button", { name: v.locale === "ar" ? "محتوى جديد" : "New content", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        expect(await dialog.locator("select").count()).toBe(1);
        await dialog.getByRole("button", { name: v.locale === "ar" ? "فتح المسودة" : "Open draft", exact: true }).click();
        await page.getByTestId("create-workspace").waitFor();
        expect(creations).toBe(1);
      } else if (v.route === "campaigns") {
        await page.getByRole("heading", { name: "Bakery launch", exact: true }).waitFor();
        expect(conversations).toBe(0);
        expect(campaignRequests).toBe(0);
        await page.screenshot({ path: `../../var/ux-correction-2026-11-15/screens/${v.route}-${v.locale}-start.png` });
        await page.getByRole("button", { name: v.locale === "ar" ? "حملة جديدة" : "New campaign", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        expect(await dialog.locator("textarea:visible").count()).toBe(0);
        expect(await dialog.locator('input[type="date"]:visible').count()).toBe(0);
        await dialog.locator('input:not([type="file"]):visible').fill("A winter bakery launch");
        await dialog
          .locator('input[type="file"]')
          .setInputFiles({ name: "event.txt", mimeType: "text/plain", buffer: Buffer.from("A fictional winter bakery event") });
        await dialog.getByRole("button", { name: v.locale === "ar" ? "إنشاء الحملة" : "Create campaign", exact: true }).click();
        await expect.poll(() => campaignRequests).toBe(1);
      } else {
        await page.getByText("A clear bakery direction", { exact: true }).waitFor();
        await page.getByText("Prepare next week’s content", { exact: true }).waitFor();
        expect(await page.getByText("COMPANY/private-source-id").count()).toBe(0);
        expect(await page.getByText("Fresh morning rituals", { exact: true }).isVisible()).toBe(false);
        expect(await page.locator("textarea").count()).toBe(0);
        expect(conversations).toBe(0);
        await page.screenshot({ path: `../../var/ux-correction-2026-11-15/screens/${v.route}-${v.locale}-start.png` });
        await page.getByRole("link", { name: v.locale === "ar" ? "تحديث مع ماركوس" : "Update with MARKOS", exact: true }).click();
        await page.getByLabel(v.locale === "ar" ? "راسل ماركوس" : "Message MARKOS", { exact: true }).waitFor();
        expect(conversations).toBeGreaterThan(0);
      }
      expect(errors).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      await context.close();
    }
  },
  60000
);
