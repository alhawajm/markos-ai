import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const baseUrl = process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) throw new Error("SETTINGS_BROWSER_BASE_URL is required for rendered legal-document tests");

const screenshotDir = process.env.MARKOS_UI_SCREENSHOT_DIR;
let browser: Browser;

describe("rendered legal documents", () => {
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

  it("keeps Terms section navigation visible on mobile", async () => {
    const context = await browser.newContext({ viewport: { height: 844, width: 390 } });
    const page = await context.newPage();

    await page.goto(`${baseUrl}/en/terms`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "The terms for using MARKOS" }).waitFor();

    const sectionSelect = page.getByRole("combobox", { name: "On this page" });
    await expect(sectionSelect.isVisible()).resolves.toBe(true);
    await sectionSelect.selectOption("account");
    await expect(page.evaluate(() => window.location.hash)).resolves.toBe("#account");
    await expect(noHorizontalOverflow(page)).resolves.toBe(true);
    await saveScreenshot(page, "legal-terms-en-mobile");
    await context.close();
  });

  it("selects the final section at the bottom of Terms and Privacy", async () => {
    const context = await browser.newContext({ viewport: { height: 800, width: 1280 } });
    const page = await context.newPage();

    for (const documentPath of ["terms", "privacy"]) {
      await page.goto(`${baseUrl}/en/${documentPath}`, { waitUntil: "networkidle" });
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
  await page.screenshot({ fullPage: true, path: path.join(screenshotDir, `${name}.png`) });
}
