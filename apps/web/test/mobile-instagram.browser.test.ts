import { mkdir } from "node:fs/promises";
import { chromium, type Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertPlexFonts } from "./browser-fonts";
const base = process.env.SETTINGS_BROWSER_BASE_URL;
if (!base) throw new Error("SETTINGS_BROWSER_BASE_URL is required");
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
describe("native Instagram return page", () => {
  it.each(["en", "ar"])(
    "renders a fixed, credential-free return link (%s)",
    async (locale) => {
      const context = await browser.newContext({ viewport: locale === "en" ? { width: 1440, height: 900 } : { width: 390, height: 844 } });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${base}/${locale}/mobile/instagram?instagram=connected&returnTo=https://evil.test&token=untrusted`, { waitUntil: "networkidle" });
      expect(await page.getByRole("heading", { level: 1 }).textContent()).toContain(locale === "en" ? "Continue in MARKOS" : "المتابعة في ماركوس");
      const link = page.getByRole("link", { name: locale === "en" ? "Open MARKOS" : "فتح ماركوس" });
      expect(await link.getAttribute("href")).toBe("markos:///instagram");
      expect(await page.locator("main").textContent()).not.toContain("untrusted");
      expect(await page.locator("main").evaluate((el) => getComputedStyle(el).direction)).toBe(locale === "en" ? "ltr" : "rtl");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await assertPlexFonts(page, ["h1", "main a", "section > p:nth-of-type(2)"]);
      expect(errors).toEqual([]);
      const dir = process.env.MARKOS_UI_SCREENSHOT_DIR;
      if (dir) {
        await mkdir(dir, { recursive: true });
        await page.screenshot({ path: `${dir}/mobile-instagram-${locale}.png`, fullPage: true });
      }
      await context.close();
    },
    90000
  );
});
