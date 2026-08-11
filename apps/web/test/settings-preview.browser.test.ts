import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const baseUrl = process.env.DESIGN_PREVIEW_BASE_URL ?? process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) {
  throw new Error("DESIGN_PREVIEW_BASE_URL or SETTINGS_BROWSER_BASE_URL is required for rendered settings-preview tests");
}

const screenshotDir = process.env.DESIGN_PREVIEW_SCREENSHOT_DIR;
let browser: Browser;

describe("rendered Sunlit Settings preview", () => {
  beforeAll(async () => {
    browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          }
        : {}),
      headless: true
    });

    if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
  });

  afterAll(async () => {
    await browser?.close();
  });

  it("uses the desktop menu as the only section selector and guards Instagram", async () => {
    const context = await browser.newContext({
      viewport: { height: 500, width: 1440 }
    });
    const page = await context.newPage();

    await page.goto(`${baseUrl}/en/design-preview/settings`, {
      waitUntil: "networkidle"
    });
    await page.getByRole("heading", { level: 1, name: "Settings" }).waitFor();

    const preview = page.locator("[data-settings-preview]");
    await expect(preview.getAttribute("dir")).resolves.toBe("ltr");
    await expect(page.locator("[data-section-navigation-surface]").evaluate((element) => getComputedStyle(element).position)).resolves.toBe("sticky");
    await expect(page.getByRole("heading", { level: 2, name: "Account" }).isVisible()).resolves.toBe(true);
    await expect(page.getByRole("heading", { level: 2, name: "Connections" }).count()).resolves.toBe(0);
    await saveScreenshot(page, "settings-en-desktop-default");

    await page.evaluate(() => window.scrollTo(0, 260));
    await page.waitForTimeout(100);
    const desktopStickyTop = await page.locator("[data-section-navigation-surface]").evaluate((element) => element.getBoundingClientRect().top);
    await expect(page.locator("[data-section-navigation-surface]").evaluate((element) => getComputedStyle(element).position)).resolves.toBe("fixed");
    expect(desktopStickyTop).toBeGreaterThanOrEqual(20);
    expect(desktopStickyTop).toBeLessThanOrEqual(30);

    await page.locator('a[href="#connections"]').click();
    await expect(page.getByRole("heading", { level: 2, name: "Connections" }).isVisible()).resolves.toBe(true);
    await expect(page.getByRole("heading", { level: 2, name: "Account" }).count()).resolves.toBe(0);
    await expect(page.getByText("MFA required", { exact: true }).first().isVisible()).resolves.toBe(true);
    await expect(page.getByRole("button", { name: "Secure my account" }).isVisible()).resolves.toBe(true);

    await page.getByRole("button", { name: "Secure my account" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Security" }).isVisible()).resolves.toBe(true);
    await page.getByRole("button", { name: "Set up MFA" }).click();
    await expect(page.getByRole("heading", { name: "What you’ll need" }).isVisible()).resolves.toBe(true);

    await expect(noHorizontalOverflow(page)).resolves.toBe(true);
    await saveScreenshot(page, "settings-en-desktop");
    await context.close();
  });

  it("keeps the Arabic mobile selector sticky and RTL-safe", async () => {
    const context = await browser.newContext({
      viewport: { height: 844, width: 390 }
    });
    const page = await context.newPage();

    await page.goto(`${baseUrl}/ar/design-preview/settings`, {
      waitUntil: "networkidle"
    });
    await page.getByRole("heading", { level: 1, name: "الإعدادات" }).waitFor();

    const preview = page.locator("[data-settings-preview]");
    const sectionSelect = page.getByRole("combobox", {
      name: "أقسام الإعدادات"
    });
    await expect(preview.getAttribute("dir")).resolves.toBe("rtl");
    await expect(sectionSelect.isVisible()).resolves.toBe(true);
    await expect(page.locator("[data-section-navigation-surface]").evaluate((element) => getComputedStyle(element).position)).resolves.toBe("sticky");

    await sectionSelect.selectOption("connections");
    await expect(page.getByRole("heading", { level: 2, name: "الاتصالات" }).isVisible()).resolves.toBe(true);
    await expect(page.getByRole("button", { name: "تأمين حسابي" }).isVisible()).resolves.toBe(true);
    await expect(noHorizontalOverflow(page)).resolves.toBe(true);
    await saveScreenshot(page, "settings-ar-mobile");
    await context.close();
  });

  it("keeps legal section navigation visible on mobile", async () => {
    const context = await browser.newContext({
      viewport: { height: 844, width: 390 }
    });
    const page = await context.newPage();

    await page.goto(`${baseUrl}/en/design-preview/terms`, {
      waitUntil: "networkidle"
    });
    await page.getByRole("heading", { level: 1, name: "The terms for using MARKOS" }).waitFor();

    const sectionSelect = page.getByRole("combobox", {
      name: "On this page"
    });
    await expect(sectionSelect.isVisible()).resolves.toBe(true);
    await sectionSelect.selectOption("account");
    await expect(page.evaluate(() => window.location.hash)).resolves.toBe("#account");
    await expect(noHorizontalOverflow(page)).resolves.toBe(true);
    await saveScreenshot(page, "legal-terms-en-mobile");
    await context.close();
  });

  it("selects the final legal section at the bottom of Terms and Privacy", async () => {
    const context = await browser.newContext({
      viewport: { height: 800, width: 1280 }
    });
    const page = await context.newPage();

    for (const documentPath of ["terms", "privacy"]) {
      await page.goto(`${baseUrl}/en/design-preview/${documentPath}`, {
        waitUntil: "networkidle"
      });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(250);

      const finalLink = page.locator('a[href="#contact"]');
      await expect(finalLink.getAttribute("aria-current")).resolves.toBe("location");
    }

    await saveScreenshot(page, "legal-privacy-en-final-section");
    await context.close();
  });
});

async function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

async function saveScreenshot(page: Page, name: string) {
  if (!screenshotDir) return;
  await page.screenshot({
    fullPage: true,
    path: path.join(screenshotDir, `${name}.png`)
  });
}
