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
  await mkdir("../../var/task-journeys-2026-11-15/screens", { recursive: true });
});
afterAll(async () => {
  await browser?.close();
});
it.each([
  { intent: "CONTENT", route: "content-studio", locale: "en", width: 1440, theme: "light" },
  { intent: "CONTENT", route: "content-studio", locale: "ar", width: 390, theme: "dark" },
  { intent: "CAMPAIGN", route: "campaigns", locale: "ar", width: 1440, theme: "light" },
  { intent: "STRATEGY", route: "strategy", locale: "en", width: 1440, theme: "dark" },
  { intent: "STRATEGY", route: "strategy", locale: "ar", width: 390, theme: "light" }
] as const)(
  "goal, short plan and result: $intent $locale $theme",
  async (v) => {
    const context = await browser.newContext({ viewport: { width: v.width, height: 900 }, colorScheme: v.theme, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const session = {
      user: { id: "task-owner", fullName: "Task Owner", email: "owner@example.test", isVerified: true, locale: v.locale },
      workspace: { id: "task-workspace", name: "Fictional bakery" },
      tokens: { accessToken: "task-fixture", expiresIn: 900 },
      roles: ["OWNER"],
      mfaVerified: true
    };
    const item = draft({ id: "22222222-2222-4222-8222-222222222222", brief: "Existing pastry draft" });
    let turns: unknown[] = [],
      messages = 0,
      confirmations = 0,
      blankCreations = 0;
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
      else if (url.pathname === "/v1/campaigns/summaries") data = { items: [], nextCursor: null };
      else if (url.pathname === "/v1/content") {
        if (method === "POST") {
          blankCreations++;
          data = item;
        } else data = [item];
      } else if (url.pathname === `/v1/content/${item.id}`) data = item;
      else if (url.pathname === `/v1/content/${item.id}/conversation`) data = { id: null, contentItem: item, messages: [], latestRun: null };
      else if (url.pathname.endsWith("/latest")) data = null;
      else if (url.pathname === "/v1/assistant/conversation") {
        if (method === "POST") {
          const input = route.request().postDataJSON();
          expect(input.intent).toBe(v.intent);
          messages++;
          data = {
            id: input.requestId,
            intent: v.intent,
            message: input.message,
            createdAt: new Date().toISOString(),
            status: "PROPOSED",
            reply: v.locale === "ar" ? "هذه خطتك المقترحة." : "Here is your proposed direction.",
            confirmationToken: "33333333-3333-4333-8333-333333333333",
            proposal: {
              action: v.intent,
              summary: "A focused bakery plan grounded in saved business knowledge.",
              instruction: input.message,
              contentType: v.intent === "CONTENT" ? "POST" : null,
              contentItemId: null,
              durationDays: v.intent === "CAMPAIGN" ? 7 : null
            }
          };
          turns = [data];
        } else {
          expect(url.searchParams.get("intent")).toBe(v.intent);
          data = turns;
        }
      } else if (url.pathname.endsWith("/confirm")) {
        confirmations++;
        data = {
          ...(turns[0] as object),
          status: "COMPLETED",
          ...(v.intent === "CONTENT"
            ? { contentItemId: item.id }
            : v.intent === "CAMPAIGN"
              ? { campaignId: "44444444-4444-4444-8444-444444444444" }
              : {
                  strategy: {
                    summary: "A clear bakery direction",
                    strategy: { objectives: ["Attract local customers"], pillars: ["Fresh morning rituals"], nextActions: ["Prepare next week’s content"] },
                    sources: ["COMPANY/private-source-id"],
                    assumptions: [],
                    missingInformation: []
                  }
                })
        };
        turns = [data];
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
    });
    try {
      await page.goto(`${base}/${v.locale}/app/${v.route}`, { waitUntil: "domcontentloaded" });
      const composer = page.getByLabel(v.locale === "ar" ? "راسل ماركوس" : "Message MARKOS", { exact: true });
      await composer.waitFor();
      expect(blankCreations).toBe(0);
      expect(await page.locator("select:visible").count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `../../var/task-journeys-2026-11-15/screens/${v.intent}-${v.locale}-${v.theme}-start.png` });
      await composer.fill(v.locale === "ar" ? "أريد جذب المزيد من العملاء إلى مخبزي." : "Help attract more customers to my bakery.");
      await page.getByRole("button", { name: v.locale === "ar" ? "إرسال الرسالة" : "Send message", exact: true }).click();
      const confirm = page.getByRole("button", { name: v.locale === "ar" ? "تأكيد وبدء" : "Confirm and start", exact: true });
      await confirm.waitFor();
      expect(messages).toBe(1);
      expect(confirmations).toBe(0);
      expect(blankCreations).toBe(0);
      await confirm.click();
      await expect.poll(() => confirmations).toBe(1);
      if (v.intent === "CONTENT") {
        const open = page.getByRole("link", { name: v.locale === "ar" ? "فتح المسودة ←" : "Open draft →", exact: true });
        await open.waitFor();
        await open.click();
        await page.getByTestId("create-workspace").waitFor();
        expect(blankCreations).toBe(0);
      } else if (v.intent === "CAMPAIGN") {
        await page.getByRole("link", { name: "فتح الحملة ←", exact: true }).waitFor();
        await page.getByRole("button", { name: "التخطيط بملفات أو ضبط الخيارات", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        expect(await dialog.getByRole("button", { name: /^14 / }).count()).toBe(0);
        await dialog.locator("summary").getByText("تعديل التوقيت والوتيرة", { exact: true }).click();
        expect(await dialog.locator('input[type="date"]').isVisible()).toBe(true);
        await page.keyboard.press("Escape");
      } else {
        await page.getByText("A clear bakery direction", { exact: true }).waitFor();
        await page.getByText("Prepare next week’s content", { exact: true }).waitFor();
        expect(await page.getByText("COMPANY/private-source-id").count()).toBe(0);
        expect(await page.getByText("Fresh morning rituals", { exact: true }).isVisible()).toBe(false);
      }
      expect(errors).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `../../var/task-journeys-2026-11-15/screens/${v.intent}-${v.locale}-${v.theme}-result.png` });
    } finally {
      await context.close();
    }
  },
  60000
);
