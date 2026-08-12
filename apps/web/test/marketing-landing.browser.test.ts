import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const baseUrl = process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) throw new Error("SETTINGS_BROWSER_BASE_URL is required for rendered marketing-page tests");

const screenshotDir = process.env.MARKOS_UI_SCREENSHOT_DIR;
const pageCases = [
  {
    locale: "en",
    direction: "ltr",
    heading: "Get the help you need with Instagram marketing.",
    primaryAction: "Start free",
    planTab: "Plan",
    createTab: "Create",
    insightsTab: "Insights",
    insightsHeading: "Understand what changed.",
    nextArrow: "ArrowRight",
    previewDisclaimer: "Design preview",
    attribution: "Powered by Ra'edat Software",
    terms: "Terms of Service",
    name: "landing-v2-en-desktop",
    viewport: { height: 1000, width: 1440 }
  },
  {
    locale: "en",
    direction: "ltr",
    heading: "Get the help you need with Instagram marketing.",
    primaryAction: "Start free",
    planTab: "Plan",
    createTab: "Create",
    insightsTab: "Insights",
    insightsHeading: "Understand what changed.",
    nextArrow: "ArrowRight",
    previewDisclaimer: "Design preview",
    attribution: "Powered by Ra'edat Software",
    terms: "Terms of Service",
    name: "landing-v2-en-mobile",
    viewport: { height: 844, width: 390 }
  },
  {
    locale: "ar",
    direction: "rtl",
    heading: "احصل على الدعم الذي تحتاجه لتسويق عملك على إنستغرام.",
    primaryAction: "ابدأ مجانًا",
    planTab: "خطّط",
    createTab: "أنشئ",
    insightsTab: "الرؤى",
    insightsHeading: "افهم ما الذي تغير.",
    nextArrow: "ArrowLeft",
    previewDisclaimer: "معاينة التصميم",
    attribution: "من تطوير Ra'edat Software",
    terms: "شروط الخدمة",
    name: "landing-v2-ar-desktop",
    viewport: { height: 1000, width: 1440 }
  },
  {
    locale: "ar",
    direction: "rtl",
    heading: "احصل على الدعم الذي تحتاجه لتسويق عملك على إنستغرام.",
    primaryAction: "ابدأ مجانًا",
    planTab: "خطّط",
    createTab: "أنشئ",
    insightsTab: "الرؤى",
    insightsHeading: "افهم ما الذي تغير.",
    nextArrow: "ArrowLeft",
    previewDisclaimer: "معاينة التصميم",
    attribution: "من تطوير Ra'edat Software",
    terms: "شروط الخدمة",
    name: "landing-v2-ar-mobile",
    viewport: { height: 844, width: 390 }
  }
] as const;

let browser: Browser;

describe("rendered Sunlit Social Studio marketing landing", () => {
  beforeAll(async () => {
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
      headless: true
    });

    if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
  });

  afterAll(async () => {
    await browser?.close();
  });

  for (const pageCase of pageCases) {
    it(`renders ${pageCase.name} without horizontal overflow`, async () => {
      const context = await browser.newContext({ viewport: pageCase.viewport });
      const page = await context.newPage();

      await page.goto(`${baseUrl}/${pageCase.locale}`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { level: 1, name: pageCase.heading }).waitFor();

      const marketingPage = page.locator('[data-marketing-page="sunlit-social-studio"]');
      await expect(marketingPage.getAttribute("dir")).resolves.toBe(pageCase.direction);
      const primaryAction = page.getByRole("link", { name: pageCase.primaryAction }).first();
      await expect(primaryAction.isVisible()).resolves.toBe(true);
      await expect(primaryAction.getAttribute("href")).resolves.toBe(`/${pageCase.locale}/signup`);

      const planTab = page.getByRole("tab", { name: pageCase.planTab });
      await planTab.focus();
      await planTab.press(pageCase.nextArrow);
      await expect(page.getByRole("tab", { name: pageCase.createTab }).getAttribute("aria-selected")).resolves.toBe("true");

      const insightsTab = page.getByRole("tab", { name: pageCase.insightsTab });
      await insightsTab.click();
      await expect(insightsTab.getAttribute("aria-selected")).resolves.toBe("true");
      await page.getByRole("tabpanel").getByRole("heading", { name: pageCase.insightsHeading }).waitFor();

      await expect(page.getByText(pageCase.previewDisclaimer, { exact: true }).count()).resolves.toBe(0);
      await expect(page.getByText(pageCase.attribution, { exact: true }).isVisible()).resolves.toBe(true);
      const termsLink = page.getByRole("link", { name: pageCase.terms });
      await expect(termsLink.isVisible()).resolves.toBe(true);
      await expect(termsLink.getAttribute("href")).resolves.toBe(`/${pageCase.locale}/terms`);
      await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).resolves.toBe(true);

      if (screenshotDir) {
        await planTab.click();
        await page.screenshot({ fullPage: true, path: path.join(screenshotDir, `${pageCase.name}.png`) });
      }

      await context.close();
    });
  }
});
