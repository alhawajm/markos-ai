import { mkdir } from "node:fs/promises";
import { chromium, type Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const baseUrl = process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) throw new Error("SETTINGS_BROWSER_BASE_URL is required");
let browser: Browser;
const envelope = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });

describe("reviewing an earlier business profile", () => {
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
    { locale: "en", width: 1440 },
    { locale: "ar", width: 390 }
  ])(
    "reviews before saving in $locale",
    async ({ locale, width }) => {
      const context = await browser.newContext({ viewport: { width, height: 920 }, colorScheme: "light" });
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      const session = {
        user: { id: "owner", fullName: "Owner", email: "owner@example.test", locale, isVerified: true },
        workspace: { id: "workspace", name: "Blooms in Pink", slug: "blooms" },
        roles: ["OWNER"],
        mfaVerified: true,
        tokens: { accessToken: "fixture-only", expiresIn: 900 }
      };
      let saves = 0;
      let knowledge = {
        version: 3,
        approved: true,
        updatedAt: "2026-10-27T08:00:00Z",
        modules: {
          company: {},
          story: {},
          audience: {},
          competitors: {},
          brand: {},
          objectives: { currentPriority: "Current priority", contentDirection: "Current direction", goals: ["Awareness"] }
        },
        catalog: null
      };
      await page.route("**/v1/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/v1/auth/refresh") return route.fulfill(envelope(session));
        if (url.pathname === "/v1/onboarding") return route.fulfill(envelope({ status: "COMPLETE", businessProfile: { status: "APPROVED" } }));
        if (url.pathname === "/v1/business-profile/history/objectives")
          return route.fulfill(
            envelope([
              { version: 3, createdAt: "2026-10-27T08:00:00Z", values: knowledge.modules.objectives },
              {
                version: 1,
                createdAt: "2026-10-26T08:00:00Z",
                values: { currentPriority: "Earlier owner wording / النص السابق", contentDirection: "Earlier direction", goals: ["Community"] }
              }
            ])
          );
        if (url.pathname === "/v1/business-profile") {
          if (route.request().method() === "PATCH") {
            const input = route.request().postDataJSON();
            expect(input).toMatchObject({
              module: "objectives",
              expectedVersion: 3,
              changes: { currentPriority: "Earlier owner wording / النص السابق", contentDirection: "Earlier direction", goals: ["Community"] }
            });
            saves += 1;
            knowledge = { ...knowledge, version: 4, modules: { ...knowledge.modules, objectives: input.changes } };
          }
          return route.fulfill(envelope(knowledge));
        }
        return route.fulfill(envelope([]));
      });
      await page.goto(`${baseUrl}/${locale}/app/knowledge`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.getByRole("button", { name: locale === "en" ? "Edit Current strategy" : "تعديل الاستراتيجية الحالية", exact: true }).click();
      await page
        .locator("summary")
        .filter({ hasText: locale === "en" ? "Version history" : "سجل الإصدارات" })
        .click();
      await page.getByLabel(locale === "en" ? "Saved version" : "الإصدار المحفوظ", { exact: true }).selectOption("1");
      await page.getByRole("button", { name: locale === "en" ? "Review this version" : "مراجعة هذا الإصدار", exact: true }).click();
      expect(saves).toBe(0);
      await expect(page.getByLabel(locale === "en" ? "Current priority" : "الأولوية الحالية", { exact: true }).inputValue()).resolves.toBe(
        "Earlier owner wording / النص السابق"
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      if (process.env.MARKOS_UI_SCREENSHOT_DIR) {
        await mkdir(process.env.MARKOS_UI_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: `${process.env.MARKOS_UI_SCREENSHOT_DIR}/profile-history-${locale}.png`, fullPage: true });
      }
      await page.getByRole("button", { name: locale === "en" ? "Save changes" : "حفظ التغييرات", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      expect(saves).toBe(1);
      await context.close();
    },
    60_000
  );
});
