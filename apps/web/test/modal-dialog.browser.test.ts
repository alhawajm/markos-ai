import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const baseUrl = process.env.SETTINGS_BROWSER_BASE_URL;
if (!baseUrl) throw new Error("SETTINGS_BROWSER_BASE_URL is required for rendered modal tests");
const screenshotDir = process.env.MARKOS_UI_SCREENSHOT_DIR;
let browser: Browser;

describe("shared native modal behavior", () => {
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

  it("keeps Notifications focus and scrolling inside the drawer, then returns to its opener in English and Arabic", async () => {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const session = {
      mfaVerified: true,
      mfaVerifiedUntil: Math.floor(Date.now() / 1000) + 3600,
      tokens: { accessToken: "modal-browser-fixture", expiresIn: 900 },
      user: { id: "modal-owner", email: "owner@modal.test", fullName: "Modal Owner", locale: "en", isVerified: true },
      workspace: { id: "modal-workspace", name: "Modal Workspace", slug: "modal-workspace" },
      roles: ["OWNER"]
    };
    const notifications = Array.from({ length: 20 }, (_, index) => ({
      id: `notification-${index}`,
      userId: session.user.id,
      workspaceId: session.workspace.id,
      channel: "IN_APP",
      templateKey: "publish_failed",
      payload: { message: `Publishing needs attention for fixture post ${index + 1}.` },
      createdAt: "2026-09-10T09:00:00.000Z",
      updatedAt: "2026-09-10T09:00:00.000Z"
    }));
    await page.addInitScript((value) => localStorage.setItem("markos.session", JSON.stringify(value)), {
      user: session.user,
      workspace: session.workspace,
      roles: session.roles
    });
    await page.route(/^http:\/\/(?:127\.0\.0\.1|localhost):4000\//, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (pathname === "/v1/auth/refresh") data = session;
      else if (pathname === "/v1/notifications") data = notifications;
      else if (pathname === "/v1/calendar") {
        const query = new URL(route.request().url()).searchParams;
        data = {
          range: { from: query.get("from"), to: query.get("to") },
          items: [],
          mediaAssets: [],
          summary: { scheduledThisWeek: 0, ready: 0, needsAttention: 0 },
          unscheduled: { items: [], total: 0 }
        };
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
    });

    try {
      for (const locale of ["en", "ar"] as const) {
        await page.goto(`${baseUrl}/${locale}/app/calendar`, { waitUntil: "networkidle" });
        const trigger = page.locator("[data-app-sidebar]").getByRole("button", { name: locale === "en" ? /Notifications/ : /التنبيهات/ });
        await trigger.waitFor();
        const backgroundScroll = page.locator("[data-app-content-scroll]");
        const before = await backgroundScroll.evaluate((element) => ({ top: element.scrollTop, overflow: (element as HTMLElement).style.overflow }));
        await trigger.click();
        const dialog = page.getByRole("dialog", { name: locale === "en" ? "Notifications" : "التنبيهات", exact: true });
        await dialog.waitFor();
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
        expect(await backgroundScroll.evaluate((element) => getComputedStyle(element).overflow)).toBe("hidden");

        await page.keyboard.press("Tab");
        expect(
          await dialog.getByRole("button", { name: locale === "en" ? "Close" : "إغلاق", exact: true }).evaluate((element) => element === document.activeElement)
        ).toBe(true);
        await page.keyboard.press("Shift+Tab");
        expect(
          await dialog
            .getByRole("button", { name: locale === "en" ? "Mark as read" : "وضع كمقروء", exact: true })
            .last()
            .evaluate((element) => element === document.activeElement)
        ).toBe(true);
        await page.keyboard.press("Tab");
        expect(
          await dialog.getByRole("button", { name: locale === "en" ? "Close" : "إغلاق", exact: true }).evaluate((element) => element === document.activeElement)
        ).toBe(true);

        await page.mouse.move(locale === "en" ? 400 : 1000, 500);
        await page.mouse.wheel(0, 500);
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        expect(await backgroundScroll.evaluate((element) => element.scrollTop)).toBe(before.top);

        const drawer = dialog.locator("aside");
        const box = await drawer.boundingBox();
        if (!box) throw new Error("Notification drawer is not visible");
        await page.mouse.move(box.x + box.width / 2, 350);
        await page.mouse.wheel(0, 550);
        await expect.poll(() => drawer.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
        expect(await backgroundScroll.evaluate((element) => element.scrollTop)).toBe(before.top);
        if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `notifications-${locale}-compact.png`), animations: "disabled" });

        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached" });
        expect(await trigger.evaluate((element) => element === document.activeElement)).toBe(true);
        expect(await backgroundScroll.evaluate((element) => (element as HTMLElement).style.overflow)).toBe(before.overflow);

        await trigger.click();
        await dialog.waitFor();
        await page.mouse.click(locale === "en" ? 400 : 1000, 300);
        await dialog.waitFor({ state: "detached" });
        expect(await trigger.evaluate((element) => element === document.activeElement)).toBe(true);
      }
    } finally {
      await context.close();
    }
  });
});
